/**
 * Cert combine - browser port of scripts/combine_certs.py.
 *
 * Combines a zip of many single-file Excel exports (Quantity, Line, Product,
 * Description, Confirmation Notes) into one workbook, filtered to specific
 * Product codes, with a blank separator row before each source file's block.
 * Optionally merges in a "LIST" CSV whose BLANK column supplies a certificate
 * reference note that goes into the Confirmation Notes cell of each separator
 * row, in order.
 *
 * Business rules (keep in step with the Python script):
 *
 *  1. PRODUCT FILTER - a row is kept only if its Product starts with
 *     "ISO4017G", starts with "933CEASS", or contains "HSFG" anywhere.
 *
 *  2. FILE NUMBERING - a file's number is the first run of digits in its
 *     filename ("01.xlsx" -> 1, "Excel (79).xlsx" -> 79, no digits -> 1).
 *     Files are combined in ascending numeric order and labelled with a
 *     zero-padded 2-digit string in the File column.
 *
 *  3. LAYOUT - one blank row goes immediately BEFORE every file's block,
 *     including the very first file.
 *
 *  4. BLANK / CERT NOTE - when the LIST has no BLANK value it is built as
 *     UPPER("NEW CERTS " + Number + " PO " + CustomerRef + " REF " + JobNumber)
 *     leaving out PO / REF when empty, and stripping a redundant leading "PO"
 *     from CustomerRef and "REF" from JobNumber (plus any separator after it).
 *
 *  5. MERGE WITH LIST - matched to separator rows purely by ORDER (list row 1
 *     -> first separator row, and so on). The counts must be equal, otherwise
 *     it errors rather than guessing. The text goes in Confirmation Notes.
 */

import type { Cell, Row, Worksheet } from "exceljs";
import JSZip from "jszip";

export const HEADERS = [
  "File",
  "Quantity",
  "Line",
  "Product",
  "Description",
  "Confirmation Notes"
] as const;

const COLUMN_WIDTHS = [10, 12, 8, 22, 40, 45];

type CellValue = string | number | boolean | Date | null;

type SourceRow = {
  quantity: CellValue;
  line: CellValue;
  product: CellValue;
  description: CellValue;
  notes: CellValue;
};

export type CombineResult = {
  blob: Blob;
  files: number;
  matchedRows: number;
  separatorRows: number;
  perFile: { label: string; name: string; matched: number }[];
};

// Rule 1
export function productMatches(product: CellValue): boolean {
  if (product === null || product === undefined) return false;
  const p = String(product).trim();
  return p.startsWith("ISO4017G") || p.startsWith("933CEASS") || p.includes("HSFG");
}

// Rule 2
export function fileNumber(filename: string): number {
  const base = filename.split("/").pop() ?? filename;
  const stem = base.replace(/\.[^.]*$/, "");
  const m = stem.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

// Rule 4
function stripLeading(value: string, prefix: string): string {
  const stripped = value.trimStart();
  if (stripped.toUpperCase().startsWith(prefix.toUpperCase())) {
    return stripped.slice(prefix.length).replace(/^[ \-:]+/, "");
  }
  return value;
}

export function buildBlank(
  number: string,
  customerRef: string,
  jobNumber: string
): string {
  let out = `NEW CERTS ${number}`;
  if (customerRef) out += ` PO ${stripLeading(customerRef, "PO")}`;
  if (jobNumber) out += ` REF ${stripLeading(jobNumber, "REF")}`;
  return out.toUpperCase();
}

/** Minimal RFC 4180 parser: quoted fields may contain commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** One BLANK string per data row of the LIST csv, in file order. */
export function readListBlanks(csvText: string): string[] {
  const [header = [], ...data] = parseCsv(csvText);

  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const findCol = (name: string) =>
    header.findIndex((h) => norm(h) === name.toLowerCase());

  const colNumber = findCol("Number");
  const colCustRef = findCol("Customer Ref");
  const colJobNum = findCol("Job Number (Particulars)");
  const colBlank = findCol("BLANK");

  const get = (row: string[], col: number) => (col >= 0 ? row[col] ?? "" : "");

  return data
    .filter((row) => row.some((c) => c.trim() !== ""))
    .map((row) => {
      const blank = get(row, colBlank);
      if (colBlank >= 0 && blank.trim() !== "") return blank;
      return buildBlank(
        get(row, colNumber),
        get(row, colCustRef),
        get(row, colJobNum)
      );
    });
}

/** Reduce an ExcelJS cell to the plain value Excel would show (formula result, text, ...). */
function plainValue(cell: Cell): CellValue {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return null;
  if (typeof v !== "object" || v instanceof Date) return v as CellValue;

  const obj = v as Record<string, unknown>;
  if ("result" in obj) {
    const r = obj.result;
    return r !== null && typeof r === "object" && !(r instanceof Date)
      ? null
      : ((r ?? null) as CellValue);
  }
  if (Array.isArray(obj.richText)) {
    return (obj.richText as { text: string }[]).map((t) => t.text).join("");
  }
  if ("text" in obj) return String(obj.text ?? "");
  if ("error" in obj) return null;
  return null;
}

function readSourceRows(ws: Worksheet): SourceRow[] {
  const out: SourceRow[] = [];

  // Row 1 is the header row; only the first five columns are used.
  for (let r = 2; r <= ws.rowCount; r++) {
    const row: Row = ws.getRow(r);
    const [quantity, line, product, description, notes] = [1, 2, 3, 4, 5].map(
      (c) => plainValue(row.getCell(c))
    );

    const blank = [quantity, line, product, description, notes].every(
      (c) => c === null || String(c).trim() === ""
    );
    if (blank) continue;

    out.push({ quantity, line, product, description, notes });
  }

  return out;
}

export async function combineCerts(
  zipFile: File,
  listFile: File | null,
  onProgress?: (done: number, total: number) => void
): Promise<CombineResult> {
  const ExcelJS = (await import("exceljs")).default;

  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());

  // Ignore __MACOSX junk, ._ resource forks and Excel lock files.
  const entries = zip
    .filter((path, entry) => {
      const name = path.split("/").pop() ?? path;
      return (
        !entry.dir &&
        path.toLowerCase().endsWith(".xlsx") &&
        !path.includes("__MACOSX") &&
        !name.startsWith("._") &&
        !name.startsWith("~$")
      );
    })
    .sort(
      (a, b) =>
        fileNumber(a.name) - fileNumber(b.name) || a.name.localeCompare(b.name)
    );

  if (!entries.length) {
    throw new Error(`No .xlsx files found inside ${zipFile.name}`);
  }

  const blanks = listFile ? readListBlanks(await listFile.text()) : null;

  // Fail before doing any work if the counts cannot be matched.
  if (blanks && blanks.length !== entries.length) {
    throw new Error(
      `Row-count mismatch: ${blanks.length} list rows vs ${entries.length} files. ` +
        "Refusing to guess a mapping - fix the inputs so the counts match."
    );
  }

  const wbOut = new ExcelJS.Workbook();
  const ws = wbOut.addWorksheet("Combined", {
    views: [{ state: "frozen", ySplit: 1 }]
  });

  ws.addRow([...HEADERS]);
  ws.getRow(1).eachCell((cell) => {
    cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" }
    };
    cell.alignment = { horizontal: "center" };
  });

  const bodyFont = { name: "Arial" };
  const fileFont = { name: "Arial", bold: true };
  const noteFont = {
    name: "Arial",
    bold: true,
    italic: true,
    color: { argb: "FFC00000" }
  };

  const perFile: CombineResult["perFile"] = [];
  let matchedRows = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const label = String(fileNumber(entry.name)).padStart(2, "0");

    const wbIn = new ExcelJS.Workbook();
    await wbIn.xlsx.load(await entry.async("arraybuffer"));
    const wsIn = wbIn.worksheets[0];

    const matched = wsIn
      ? readSourceRows(wsIn).filter((r) => productMatches(r.product))
      : [];

    // Rule 3: blank row before every file, including the first
    const separator = ws.addRow([]);
    if (blanks) {
      const cell = separator.getCell(HEADERS.indexOf("Confirmation Notes") + 1);
      cell.value = blanks[i];
      cell.font = noteFont;
    }

    for (const r of matched) {
      const row = ws.addRow([
        label,
        r.quantity,
        r.line,
        r.product,
        r.description,
        r.notes
      ]);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = bodyFont;
      });
      row.getCell(1).font = fileFont;
    }

    matchedRows += matched.length;
    perFile.push({
      label,
      name: entry.name.split("/").pop() ?? entry.name,
      matched: matched.length
    });
    onProgress?.(i + 1, entries.length);
  }

  COLUMN_WIDTHS.forEach((width, i) => {
    ws.getColumn(i + 1).width = width;
  });

  const buffer = await wbOut.xlsx.writeBuffer();

  return {
    blob: new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }),
    files: entries.length,
    matchedRows,
    separatorRows: entries.length,
    perFile
  };
}
