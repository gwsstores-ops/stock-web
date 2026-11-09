import type { OcrPass, PdfPageText, PdfWord } from "./types";

/**
 * Reads the words out of a packing list, with their positions.
 *
 * Suppliers send a mix of digital PDFs and scans, so each page is tried as text
 * first and only falls back to OCR when the page carries no text layer. OCR
 * positions are converted back into PDF points with the y axis flipped, so a
 * supplier's rules work the same either way.
 */

/** Below this many words a page is treated as a scan rather than a text PDF. */
const TEXT_LAYER_MIN_WORDS = 12;

/** Rendering above the PDF's own size gives the OCR engine something to read. */
const OCR_SCALE = 3;

/**
 * Below this mean OCR confidence (0-100) a page may have been scanned
 * sideways, so it's read again turned a quarter each way and the best reading
 * kept. Upright scans read at 80+ (GDPA, JINDING) and 55 for HAMIDI's poor
 * scan; JINDING's sideways page read 44 as it came.
 */
const UPRIGHT_MIN_CONFIDENCE = 50;

/**
 * pdf.js decodes JBIG2 and JPEG 2000 scan images (common in scanned packing
 * lists) with these, copied from pdfjs-dist/wasm. Without them those pages
 * render blank.
 */
const PDFJS_WASM_URL = "/pdfjs-wasm/";

export type ExtractProgress = {
  page: number;
  pages: number;
  stage: "text" | "ocr";
  /** Which OCR reading this is, when the page is read more than once. */
  pass?: { index: number; of: number };
};

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;

const loadPdfJs = async (): Promise<PdfJs> => {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }

  return pdfjsPromise;
};

type TesseractWorker = Awaited<
  ReturnType<typeof import("tesseract.js")["createWorker"]>
>;

type OcrWord = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

type OcrReading = { words: PdfWord[]; confidence: number };

type OcrBlock = {
  paragraphs: {
    lines: {
      words: OcrWord[];
    }[];
  }[];
};

/**
 * Word-level positions only come back from tesseract.js when the recognise
 * call explicitly asks for `blocks` output - the default output is `{ text:
 * true }`, which leaves `data.blocks` (and any per-word boxes) null. The
 * top-level `recognize()` shorthand has no way to pass that option, so a
 * worker is created and reused across every scanned page instead.
 */
const ocrPage = async (
  worker: TesseractWorker,
  canvas: HTMLCanvasElement,
  pageNumber: number,
  scale: number
): Promise<OcrReading> => {
  const result = await worker.recognize(canvas, {}, { blocks: true });
  const blocks = ((result.data as unknown as { blocks?: OcrBlock[] | null })
    .blocks ?? []) as OcrBlock[];

  const words = blocks.flatMap((block) =>
    block.paragraphs.flatMap((paragraph) =>
      paragraph.lines.flatMap((line) => line.words)
    )
  );

  const height = canvas.height;

  return {
    confidence: result.data.confidence,
    words: words
      .filter((word) => word.text.trim().length > 0)
      .map((word) => ({
        page: pageNumber,
        // Back to PDF points, measuring y up from the foot of the page so the
        // numbers line up with what the text layer would have given.
        x: word.bbox.x0 / scale,
        y: (height - word.bbox.y1) / scale,
        height: (word.bbox.y1 - word.bbox.y0) / scale,
        text: word.text
      }))
  };
};

/** Turns a rendered page pure black and white at the given grey level. */
const threshold = (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, level: number) => {
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;

  for (let i = 0; i < data.length; i += 4) {
    const grey = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const value = grey < level ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  context.putImageData(image, 0, 0);
};

/**
 * Pass `ocrPasses` for a supplier whose scans need it (see SupplierRules.ocr):
 * each scanned page is then OCR'd once per pass instead of once as rendered.
 */
export const extractPdf = async (
  file: File,
  onProgress?: (progress: ExtractProgress) => void,
  ocrPasses?: OcrPass[]
): Promise<PdfPageText[]> => {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, wasmUrl: PDFJS_WASM_URL })
    .promise;
  const pages: PdfPageText[] = [];

  let worker = null as TesseractWorker | null;

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      onProgress?.({ page: pageNumber, pages: doc.numPages, stage: "text" });

      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();

      // Some suppliers' PDFs carry a /Rotate flag (the page content is authored
      // sideways and rotated back to upright for display). item.transform is in
      // that raw, unrotated space, so it's run through the page's own viewport
      // and flipped back to a y-up page-space to normalise it - this is a
      // no-op for the common case of an unrotated page, since the flip and the
      // viewport's y-down flip cancel out.
      const rotationViewport = page.getViewport({ scale: 1 });

      const words: PdfWord[] = content.items
        .map((item) => item as { str?: string; transform?: number[] })
        .filter((item) => item.str?.trim() && item.transform)
        .map((item) => {
          const [x, y] = rotationViewport.convertToViewportPoint(
            item.transform![4],
            item.transform![5]
          );

          return {
            page: pageNumber,
            x,
            y: rotationViewport.height - y,
            text: item.str!
          };
        });

      if (words.length >= TEXT_LAYER_MIN_WORDS) {
        pages.push({ page: pageNumber, words, ocr: false });
        continue;
      }

      const passes: (OcrPass | null)[] = ocrPasses?.length ? ocrPasses : [null];
      const readings: PdfWord[][] = [];

      /** Renders the page turned `turn` degrees on from upright and OCRs it. */
      const read = async (pass: OcrPass | null, turn: number): Promise<OcrReading | null> => {
        const scale = pass?.scale ?? OCR_SCALE;
        const viewport = page.getViewport({ scale, rotation: (page.rotate + turn) % 360 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        const context = canvas.getContext("2d", { willReadFrequently: Boolean(pass?.threshold) });

        if (!context) return null;

        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (pass?.threshold) threshold(context, canvas, pass.threshold);

        if (!worker) {
          const { createWorker } = await import("tesseract.js");
          worker = await createWorker("eng");
        }

        return ocrPage(worker, canvas, pageNumber, scale);
      };

      // Settled on the first reading, then kept for the rest.
      let turn = 0;

      for (const [index, pass] of passes.entries()) {
        onProgress?.({
          page: pageNumber,
          pages: doc.numPages,
          stage: "ocr",
          pass: passes.length > 1 ? { index: index + 1, of: passes.length } : undefined
        });

        let reading = await read(pass, turn);

        if (!reading) break;

        if (index === 0 && reading.confidence < UPRIGHT_MIN_CONFIDENCE) {
          for (const sideways of [90, 270]) {
            const turned = await read(pass, sideways);
            if (turned && turned.confidence > reading.confidence) {
              reading = turned;
              turn = sideways;
            }
          }
        }

        readings.push(reading.words);
      }

      pages.push(
        readings.length
          ? {
              page: pageNumber,
              words: readings[0],
              ocr: true,
              passes: readings.length > 1 ? readings : undefined
            }
          : { page: pageNumber, words, ocr: false }
      );
    }
  } finally {
    await worker?.terminate();
  }

  return pages;
};
