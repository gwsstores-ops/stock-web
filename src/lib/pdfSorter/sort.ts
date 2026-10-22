/**
 * PDF Sorter - browser port of pdf_sorter2/copy_pdfs_windows.py.
 *
 * Reads a list of heat/serial numbers grouped under "NEW ..." invoice
 * headings, finds the matching PDF (by filename only, not contents) for each
 * number among a folder of PDFs the user picks, sorts them into
 * per-customer/per-batch groups, and merges each group into one combined
 * PDF. The result is handed back as a zip (mirroring the Python script's
 * found_pdfs/ folder) rather than written to disk.
 *
 * Differences from the Python script (deliberate simplifications for the
 * browser): no "previous run" backup (each download stands alone), and
 * nothing is opened automatically - the zip is just offered for download.
 */

import { parseCsv } from "@/lib/certs/combine";

const CUSTOMER_NOT_FOUND_FOLDER = "CUSTOMER NOT FOUND";
const A4: [number, number] = [595.28, 841.89];

export type SortStats = {
  pdfFilesChecked: number;
  itemsFound: number;
  itemsNotFound: number;
  uniqueNotFoundCount: number;
  multipleMatchCount: number;
};

export type SortResult = {
  zipBlob: Blob;
  stats: SortStats;
  summaryText: string;
  notFoundCsv: string;
  details: string[];
  notFoundItems: string[];
  multipleMatchItems: string[];
  customerNotes: string[];
  mergeNotes: string[];
};

// Mirrors safe_name() - makes a value safe to use as a Windows folder/file name.
export function safeName(value: string, fallback = "UNTITLED"): string {
  let v = (value ?? "").normalize("NFKC").trim();
  v = v.replace(/[\\/:*?"<>|]/g, "_");
  v = v.replace(/\s+/g, " ").trim();
  v = v.replace(/[. ]+$/, "").replace(/^[. ]+/, "");
  return (v || fallback).slice(0, 180);
}

// Mirrors safe_customer_name().
export function safeCustomerName(value: string): string {
  let v = (value ?? "").normalize("NFKC").trim();
  v = v.replace(/\*/g, "");
  v = v.replace(/[\\/:?"<>|\x00]/g, "_");
  v = v.replace(/\s+/g, " ").trim();
  v = v.replace(/[. ]+$/, "").replace(/^[. ]+/, "");
  v = v.replace(/,\s*$/, "").trim();
  return (v || CUSTOMER_NOT_FOUND_FOLDER).slice(0, 180);
}

export function normalizeInvoiceNumber(value: string): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

// Mirrors extract_invoice_number().
export function extractInvoiceNumber(headingText: string): string | null {
  const match = headingText.match(/(?<![A-Za-z0-9])SI\s*\d+(?![A-Za-z0-9])/i);
  return match ? normalizeInvoiceNumber(match[0]) : null;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Mirrors strict_filename_match() - whole-word match against the filename only.
export function strictFilenameMatch(searchTerm: string, filenameStem: string): boolean {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(searchTerm)}(?![A-Za-z0-9])`, "i");
  return pattern.test(filenameStem);
}

export const stemOf = (filename: string) => filename.replace(/\.[^./\\]+$/, "");

// Mirrors natural_sort_key() - groups of digits compare numerically.
export function naturalCompare(a: string, b: string): number {
  const split = (s: string) => s.match(/(\d+|\D+)/g) ?? [];
  const as = split(a);
  const bs = split(b);
  const len = Math.max(as.length, bs.length);

  for (let i = 0; i < len; i++) {
    const x = as[i] ?? "";
    const y = bs[i] ?? "";
    const xIsNum = /^\d+$/.test(x);
    const yIsNum = /^\d+$/.test(y);

    if (xIsNum && yIsNum) {
      const diff = parseInt(x, 10) - parseInt(y, 10);
      if (diff) return diff;
    } else {
      const cx = x.toLowerCase();
      const cy = y.toLowerCase();
      if (cx < cy) return -1;
      if (cx > cy) return 1;
    }
  }

  return 0;
}

/** Reads the invoice/customer list as rows, from either a .csv or an .xlsx (first sheet). */
export async function readInvoiceCustomerRows(file: File): Promise<string[][]> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) return parseCsv(await file.text());

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(row.getCell(c).text ?? "");
    rows.push(cells);
  });
  return rows;
}

/** Mirrors read_invoice_customer_index() - requires Number and Customer columns. */
export function parseInvoiceCustomerRows(rows: string[][]): Map<string, string> {
  const [header = [], ...data] = rows;

  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const numberCol = header.findIndex((h) => norm(h) === "number");
  const customerCol = header.findIndex((h) => norm(h) === "customer");

  if (numberCol < 0 || customerCol < 0) {
    throw new Error("The invoice/customer file must have columns named Number and Customer.");
  }

  const index = new Map<string, string>();

  for (const row of data) {
    const invoiceNumber = normalizeInvoiceNumber(row[numberCol] ?? "");
    const customer = (row[customerCol] ?? "").trim();
    if (!invoiceNumber || !customer) continue;
    if (!index.has(invoiceNumber)) index.set(invoiceNumber, customer);
  }

  if (!index.size) {
    throw new Error("The invoice/customer file has no usable Number/Customer rows.");
  }

  return index;
}

const wrapText = (text: string, width: number): string[] => {
  if (text.length <= width) return [text];
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
};

type PdfLibModule = typeof import("pdf-lib");

async function createNotFoundPdf(
  pdfLib: PdfLibModule,
  itemNumber: number,
  searchTerm: string
): Promise<Uint8Array> {
  const doc = await pdfLib.PDFDocument.create();
  const page = doc.addPage(A4);
  const { width, height } = page.getSize();
  const bold = await doc.embedFont(pdfLib.StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(pdfLib.StandardFonts.Helvetica);

  const drawCentered = (text: string, y: number, font: typeof bold, size: number) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font });
  };

  drawCentered("NOT FOUND", height - 150, bold, 28);
  drawCentered(`Item ${String(itemNumber).padStart(3, "0")}`, height - 195, regular, 16);

  let y = height - 250;
  for (const line of wrapText(searchTerm, 55)) {
    drawCentered(line, y, bold, 18);
    y -= 25;
  }

  drawCentered(`Generated on ${new Date().toLocaleString()}`, 70, regular, 10);

  return doc.save();
}

async function mergeBatch(
  pdfLib: PdfLibModule,
  items: { bytes: Uint8Array; name: string }[]
): Promise<{ bytes: Uint8Array | null; warnings: string[] }> {
  const out = await pdfLib.PDFDocument.create();
  const warnings: string[] = [];
  let added = 0;

  for (const item of items) {
    try {
      const src = await pdfLib.PDFDocument.load(item.bytes, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
      added++;
    } catch (err) {
      warnings.push(
        `Could not add ${item.name}: ${err instanceof Error ? err.message : "unreadable PDF"}`
      );
    }
  }

  if (!added) return { bytes: null, warnings };
  return { bytes: await out.save(), warnings };
}

type PdfFile = { file: File; relPath: string; stem: string };

const relativePathOf = (file: File) =>
  (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

export async function sortPdfs(
  pdfFileList: File[],
  serialsText: string,
  invoiceCustomerFile: File,
  onProgress?: (done: number, total: number) => void
): Promise<SortResult> {
  const pdfLib = await import("pdf-lib");
  const JSZip = (await import("jszip")).default;

  const invoiceCustomerIndex = parseInvoiceCustomerRows(
    await readInvoiceCustomerRows(invoiceCustomerFile)
  );

  const searchLines = serialsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!searchLines.length) {
    throw new Error("No heat numbers were found - paste the contents of serials.txt.");
  }

  const pdfFiles: PdfFile[] = pdfFileList
    .filter((file) => file.name.toLowerCase().endsWith(".pdf"))
    .map((file) => ({ file, relPath: relativePathOf(file), stem: stemOf(file.name) }))
    .sort((a, b) => a.relPath.toLowerCase().localeCompare(b.relPath.toLowerCase()));

  if (!pdfFiles.length) {
    throw new Error("No PDF files were found in the folder you picked.");
  }

  const zip = new JSZip();
  const found = zip.folder("found_pdfs")!;

  let copiedCount = 0;
  let notFoundCount = 0;
  let multipleMatchCount = 0;
  const details: string[] = [];
  const notFoundItems: string[] = [];
  const notFoundSearchTerms: string[] = [];
  const multipleMatchItems: string[] = [];
  const mergeNotes: string[] = [];
  const customerNotes: string[] = [];

  let currentBatchName: string | null = null;
  let currentCustomerName: string | null = null;
  let currentBatchPath: string | null = null;
  let currentBatchFiles: { bytes: Uint8Array; name: string }[] = [];
  let itemNumber = 0;

  const finishCurrentBatch = async () => {
    if (currentBatchName && currentBatchPath) {
      const { bytes, warnings } = await mergeBatch(pdfLib, currentBatchFiles);
      warnings.forEach((w) => mergeNotes.push(`[${currentBatchName}] ${w}`));

      if (bytes) {
        found.file(`${currentBatchPath}/${safeName(currentBatchName)}.pdf`, bytes);
        mergeNotes.push(`Merged ${currentBatchFiles.length} item(s) into ${currentBatchPath}/${safeName(currentBatchName)}.pdf`);
      } else if (currentBatchFiles.length) {
        mergeNotes.push(`Merge skipped for ${currentBatchName}: no readable PDFs could be merged`);
      }
    }

    currentBatchFiles = [];
  };

  let done = 0;
  const total = searchLines.length;

  for (const line of searchLines) {
    if (/^new /i.test(line)) {
      await finishCurrentBatch();

      currentBatchName = line.slice(line.indexOf(" ") + 1).trim() || "UNTITLED";
      const invoiceNumber = extractInvoiceNumber(currentBatchName);
      currentCustomerName = invoiceNumber ? invoiceCustomerIndex.get(invoiceNumber) ?? null : null;

      if (!currentCustomerName) {
        currentCustomerName = CUSTOMER_NOT_FOUND_FOLDER;
        customerNotes.push(
          invoiceNumber
            ? `${currentBatchName}: invoice ${invoiceNumber} was not found in invoice_customer.csv`
            : `${currentBatchName}: no SI invoice number was found in the folder heading`
        );
      }

      currentBatchPath = `${safeCustomerName(currentCustomerName)}/${safeName(currentBatchName)}`;
      itemNumber = 0;
      done++;
      onProgress?.(done, total);
      continue;
    }

    if (currentBatchName === null || currentBatchPath === null) {
      currentBatchName = "UNSORTED";
      currentCustomerName = CUSTOMER_NOT_FOUND_FOLDER;
      currentBatchPath = `${CUSTOMER_NOT_FOUND_FOLDER}/UNSORTED`;
      itemNumber = 0;
      customerNotes.push("UNSORTED: no NEW heading was found");
    }

    itemNumber++;
    const searchTerm = line;
    const matches = pdfFiles.filter((p) => strictFilenameMatch(searchTerm, p.stem));

    if (matches.length) {
      const chosen = matches[0];
      const bytes = new Uint8Array(await chosen.file.arrayBuffer());
      const destName = `${String(itemNumber).padStart(3, "0")}_${chosen.file.name}`;
      found.file(`${currentBatchPath}/${destName}`, bytes);
      currentBatchFiles.push({ bytes, name: destName });
      copiedCount++;

      details.push(
        `${currentBatchName} item ${String(itemNumber).padStart(3, "0")}: FOUND '${searchTerm}' -> ${chosen.relPath}`
      );

      if (matches.length > 1) {
        multipleMatchCount++;
        multipleMatchItems.push(
          `${currentBatchName} item ${String(itemNumber).padStart(3, "0")} '${searchTerm}' matched ${matches.length} PDFs; used ${chosen.relPath}. All matches: ${matches.map((m) => m.relPath).join(", ")}`
        );
      }
    } else {
      const bytes = await createNotFoundPdf(pdfLib, itemNumber, searchTerm);
      const destName = `${String(itemNumber).padStart(3, "0")}_NOT FOUND - ${safeName(searchTerm, "ITEM")}.pdf`;
      found.file(`${currentBatchPath}/${destName}`, bytes);
      currentBatchFiles.push({ bytes, name: destName });
      notFoundCount++;

      details.push(`${currentBatchName} item ${String(itemNumber).padStart(3, "0")}: NOT FOUND '${searchTerm}'`);
      notFoundItems.push(`${currentBatchName} item ${String(itemNumber).padStart(3, "0")}: NOT FOUND '${searchTerm}'`);
      notFoundSearchTerms.push(searchTerm);
    }

    done++;
    onProgress?.(done, total);
  }

  await finishCurrentBatch();

  // Mirrors write_not_found_csv() - one case-insensitive unique heat number per row.
  const uniqueTerms = new Map<string, string>();
  for (const term of notFoundSearchTerms) {
    const key = term.toLowerCase();
    if (!uniqueTerms.has(key)) uniqueTerms.set(key, term);
  }
  const sortedNotFound = Array.from(uniqueTerms.values()).sort(naturalCompare);
  const notFoundCsv = ["HEAT NUMBER", ...sortedNotFound].join("\r\n") + "\r\n";
  found.file("heat_numbers_not_found.csv", "﻿" + notFoundCsv);

  const stats: SortStats = {
    pdfFilesChecked: pdfFiles.length,
    itemsFound: copiedCount,
    itemsNotFound: notFoundCount,
    uniqueNotFoundCount: sortedNotFound.length,
    multipleMatchCount
  };

  const summaryLines = [
    "=".repeat(60),
    "PDF SORTER SUMMARY",
    "=".repeat(60),
    `Run finished: ${new Date().toLocaleString()}`,
    "Search method: strict filename match only",
    `PDFs checked: ${stats.pdfFilesChecked}`,
    `Items found: ${stats.itemsFound}`,
    `Items not found: ${stats.itemsNotFound}`,
    `Unique heat numbers not found: ${stats.uniqueNotFoundCount}`,
    `Items with multiple matches: ${stats.multipleMatchCount}`,
    "",
    "RESULT DETAILS",
    "-".repeat(60),
    ...details
  ];

  if (notFoundItems.length) summaryLines.push("", "NOT FOUND ITEMS", "-".repeat(60), ...notFoundItems);
  if (multipleMatchItems.length)
    summaryLines.push("", "MULTIPLE MATCHES", "-".repeat(60), ...multipleMatchItems);
  if (mergeNotes.length) summaryLines.push("", "MERGED PDFS", "-".repeat(60), ...mergeNotes);
  if (customerNotes.length)
    summaryLines.push("", "CUSTOMER LOOKUP ISSUES", "-".repeat(60), ...customerNotes);

  const summaryText = summaryLines.join("\n");
  found.file("summary.txt", summaryText);

  const zipBlob = await zip.generateAsync({ type: "blob" });

  return {
    zipBlob,
    stats,
    summaryText,
    notFoundCsv,
    details,
    notFoundItems,
    multipleMatchItems,
    customerNotes,
    mergeNotes
  };
}
