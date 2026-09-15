import type { PdfPageText, PdfWord } from "./types";

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

export type ExtractProgress = {
  page: number;
  pages: number;
  stage: "text" | "ocr";
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

type OcrWord = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

const ocrPage = async (
  canvas: HTMLCanvasElement,
  pageNumber: number
): Promise<PdfWord[]> => {
  const { recognize } = await import("tesseract.js");
  const result = await recognize(canvas, "eng");
  const words = (result.data as unknown as { words?: OcrWord[] }).words ?? [];
  const height = canvas.height;

  return words
    .filter((word) => word.text.trim().length > 0)
    .map((word) => ({
      page: pageNumber,
      // Back to PDF points, measuring y up from the foot of the page so the
      // numbers line up with what the text layer would have given.
      x: word.bbox.x0 / OCR_SCALE,
      y: (height - word.bbox.y1) / OCR_SCALE,
      text: word.text
    }));
};

export const extractPdf = async (
  file: File,
  onProgress?: (progress: ExtractProgress) => void
): Promise<PdfPageText[]> => {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages: PdfPageText[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    onProgress?.({ page: pageNumber, pages: doc.numPages, stage: "text" });

    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    const words: PdfWord[] = content.items
      .map((item) => item as { str?: string; transform?: number[] })
      .filter((item) => item.str?.trim() && item.transform)
      .map((item) => ({
        page: pageNumber,
        x: item.transform![4],
        y: item.transform![5],
        text: item.str!
      }));

    if (words.length >= TEXT_LAYER_MIN_WORDS) {
      pages.push({ page: pageNumber, words, ocr: false });
      continue;
    }

    onProgress?.({ page: pageNumber, pages: doc.numPages, stage: "ocr" });

    const viewport = page.getViewport({ scale: OCR_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const context = canvas.getContext("2d");

    if (!context) {
      pages.push({ page: pageNumber, words, ocr: false });
      continue;
    }

    await page.render({ canvas, canvasContext: context, viewport }).promise;

    pages.push({
      page: pageNumber,
      words: await ocrPage(canvas, pageNumber),
      ocr: true
    });
  }

  return pages;
};
