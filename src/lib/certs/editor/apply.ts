/**
 * Cert editor - applies a supplier's rules to an original cert.
 *
 * The original pages are kept as they are and the edits are drawn on top, so
 * nothing the manufacturer certified is retyped or re-rendered. Boxes are
 * measured in points against the page size in the supplier's rules and scaled
 * by width for a page of another size, staying on whichever edge they are
 * anchored to.
 */

import { ASSETS, type AssetId, type Box, type CertRules } from "./types";

export type EditedCert = {
  name: string;
  blob: Blob;
  pages: number;
  /** Pages the steps were applied to, 1-based. */
  editedPages: number[];
  /** Set when the cert does not read like one of this supplier's. */
  warning: string | null;
};

const assetCache = new Map<AssetId, Promise<ArrayBuffer>>();

const loadAsset = (asset: AssetId): Promise<ArrayBuffer> => {
  let pending = assetCache.get(asset);

  if (!pending) {
    pending = fetch(ASSETS[asset]).then((res) => {
      if (!res.ok) throw new Error(`Could not load ${ASSETS[asset]}`);
      return res.arrayBuffer();
    });
    assetCache.set(asset, pending);
  }

  return pending;
};

/** Which pages a supplier's steps go on, 1-based. */
export const pagesInScope = (rules: CertRules, pageCount: number): number[] => {
  if (rules.scope === "first") return pageCount ? [1] : [];
  if (rules.scope === "last") return pageCount ? [pageCount] : [];
  return Array.from({ length: pageCount }, (_, i) => i + 1);
};

/**
 * Box in points, converted to pdf-lib's bottom-left origin and scaled for a
 * page that is not the size the rules were measured on.
 */
const place = (
  box: Box,
  pageWidth: number,
  pageHeight: number,
  reference: CertRules["reference"]
) => {
  const scale = pageWidth / reference.width;

  const x = box.x * scale;
  const w = box.w * scale;
  const h = box.h * scale;
  const offset = box.y * scale;

  return {
    x,
    y: box.from === "top" ? pageHeight - offset - h : offset,
    width: w,
    height: h
  };
};

/** Pulls the page text out, only to check the right supplier was picked. */
const readText = async (file: File): Promise<string> => {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const parts: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    parts.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
    );
  }

  await doc.destroy();

  return parts.join(" ").replace(/\s+/g, " ").toUpperCase();
};

/** True when none of the supplier's fingerprint wording is in the cert. */
const looksWrong = async (file: File, rules: CertRules): Promise<boolean> => {
  if (!rules.fingerprint.length) return false;

  try {
    const text = await readText(file);
    if (!text.trim()) return false; // A scan has no text layer to check.
    return !rules.fingerprint.some((mark) => text.includes(mark.toUpperCase()));
  } catch {
    return false; // Never block the edit on the check itself failing.
  }
};

export const editedName = (name: string) =>
  `${name.replace(/\.pdf$/i, "")} GWS.pdf`;

export async function applyCertRules(
  file: File,
  rules: CertRules
): Promise<EditedCert> {
  if (!rules.ready) {
    throw new Error(`No cert rules have been written for ${rules.label} yet.`);
  }

  const { PDFDocument, degrees, rgb } = await import("pdf-lib");

  const warning = (await looksWrong(file, rules))
    ? `This does not read like a ${rules.label} cert - check the supplier before sending it out.`
    : null;

  const pdf = await PDFDocument.load(await file.arrayBuffer());
  const pageNumbers = pagesInScope(rules, pdf.getPageCount());

  // Each image is embedded once and reused across every page it goes on.
  const images = new Map<AssetId, Awaited<ReturnType<typeof pdf.embedPng>>>();

  for (const step of rules.steps) {
    if (step.kind === "stamp" && !images.has(step.asset)) {
      images.set(step.asset, await pdf.embedPng(await loadAsset(step.asset)));
    }
  }

  for (const pageNumber of pageNumbers) {
    const page = pdf.getPage(pageNumber - 1);
    const { width, height } = page.getSize();

    for (const step of rules.steps) {
      const at = place(step.box, width, height, rules.reference);

      if (step.kind === "cover") {
        page.drawRectangle({ ...at, color: rgb(1, 1, 1) });
      } else {
        const image = images.get(step.asset);
        if (image) {
          page.drawImage(image, {
            ...at,
            ...(step.rotate ? { rotate: degrees(step.rotate) } : {})
          });
        }
      }
    }
  }

  const bytes = await pdf.save();

  return {
    name: editedName(file.name),
    blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    pages: pdf.getPageCount(),
    editedPages: pageNumbers,
    warning
  };
}
