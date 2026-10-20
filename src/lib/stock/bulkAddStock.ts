// Shared by the Admin -> Bulk Add Stock preview and apply API routes (and the
// page's client-side CSV parsing). Mirrors the find-or-create logic in
// add_stock_line / stock_import_sync (migration/15, migration/07) so a row's
// catalog match here is exactly the match the database will make - the whole
// point is to catch a product_display_label_unique collision (same displayed
// diameter/length text, different underlying value - see
// migration/10_fix_duplicate_display_products.sql) before it reaches the
// database, with a message that says which value to fix.

export type RawStockRow = Record<string, string>;

export type ParsedStockRow = {
  area: string;
  location: string;
  palletId: string;
  cat: string;
  item: string;
  size: string;
  diamValue: number | null;
  diamDisplay: string;
  lengthValue: number | null;
  lengthDisplay: string;
  qty: number | null;
  note: string;
  code: string;
};

export type ProductRef = {
  id: number;
  cat: string | null;
  item: string | null;
  size: string | null;
  diamValue: number | null;
  diamDisplay: string | null;
  lengthValue: number | null;
  lengthDisplay: string | null;
};

export type RowStatus = "new-product" | "existing-product" | "error";

export type RowCheck = {
  index: number;
  row: ParsedStockRow;
  status: RowStatus;
  message: string;
  matchedProductId?: number;
};

type CsvCell = string;

/** A small RFC4180 parser: handles quoted fields, embedded commas/newlines, "" escapes. */
function parseCsvLines(text: string): CsvCell[][] {
  const rows: CsvCell[][] = [];
  let row: CsvCell[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\r") {
      // skip, \n (or end of text) closes the row
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** Parses a CSV file's text into header-keyed records (lower-cased header keys, trimmed values). */
export function parseStockCsv(text: string): RawStockRow[] {
  const lines = parseCsvLines(text.replace(/^﻿/, ""));
  if (lines.length === 0) return [];

  const header = lines[0].map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((cells) => {
    const record: RawStockRow = {};
    header.forEach((key, i) => {
      record[key] = (cells[i] ?? "").trim();
    });
    return record;
  });
}

const get = (raw: RawStockRow, ...keys: string[]): string => {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key].trim();
  }
  return "";
};

const parseNumberField = (
  raw: RawStockRow,
  errors: string[],
  label: string,
  ...keys: string[]
): number | null => {
  const text = get(raw, ...keys);
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n)) {
    errors.push(`${label} "${text}" is not a number`);
    return null;
  }
  return n;
};

function normalizeRow(raw: RawStockRow): { row: ParsedStockRow; errors: string[] } {
  const errors: string[] = [];

  const area = get(raw, "area");
  const location = get(raw, "location");
  const palletId = get(raw, "pallet_id", "palletid", "pallet");
  const cat = get(raw, "cat", "category");
  const item = get(raw, "item");
  const size = get(raw, "size");
  const diamDisplay = get(raw, "diam_display", "diamdisplay");
  const lengthDisplay = get(raw, "length_display", "lengthdisplay");
  const note = get(raw, "note", "NOTE");
  const code = get(raw, "code");

  if (!area) errors.push("Area is required");
  if (!location) errors.push("Location is required");
  if (!cat) errors.push("Cat is required");
  if (!item) errors.push("Item is required");
  if (!size) errors.push("Size is required");

  const diamValue = parseNumberField(raw, errors, "Diam value", "diam_value", "diamvalue");
  const lengthValue = parseNumberField(raw, errors, "Length value", "length_value", "lengthvalue");

  let qty: number | null = null;
  const qtyText = get(raw, "qty", "quantity");
  if (qtyText === "") {
    errors.push("Qty is required");
  } else {
    const n = Number(qtyText);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      errors.push(`Qty "${qtyText}" must be a whole number 0 or more`);
    } else {
      qty = n;
    }
  }

  return {
    row: {
      area,
      location,
      palletId,
      cat,
      item,
      size,
      diamValue,
      diamDisplay,
      lengthValue,
      lengthDisplay,
      qty,
      note,
      code
    },
    errors
  };
}

const norm = (s: string) => (s.trim() === "" ? null : s.trim());

/** Same grouping as the product_display_label_unique constraint: cat, item, size, diam_display, length_display. */
const displayKey = (cat: string, item: string, size: string, diamDisplay: string, lengthDisplay: string) =>
  JSON.stringify([norm(cat), norm(item), norm(size), norm(diamDisplay), norm(lengthDisplay)]);

const numEq = (a: number | null, b: number | null) => (a === null && b === null) || a === b;

const fmtNum = (n: number | null) => (n === null ? "blank" : String(n));

/**
 * Checks every row against the existing catalog (and against the rest of the
 * batch), returning a per-row verdict: it reuses an existing product, it
 * creates a new one, or it collides - same displayed label as an existing (or
 * earlier-in-file) row but a different diam/length value underneath, which is
 * exactly what product_display_label_unique rejects at insert time.
 */
export function validateBulkStockRows(rawRows: RawStockRow[], existingProducts: ProductRef[]): RowCheck[] {
  const byDisplay = new Map<string, ProductRef[]>();
  for (const p of existingProducts) {
    const key = displayKey(p.cat ?? "", p.item ?? "", p.size ?? "", p.diamDisplay ?? "", p.lengthDisplay ?? "");
    const list = byDisplay.get(key) ?? [];
    list.push(p);
    byDisplay.set(key, list);
  }

  const batchCreated = new Map<string, { diamValue: number | null; lengthValue: number | null; firstIndex: number }>();
  const results: RowCheck[] = [];

  rawRows.forEach((raw, i) => {
    const index = i + 1; // 1-based, matching the row's position under the header in the file
    const { row, errors } = normalizeRow(raw);

    if (errors.length > 0) {
      results.push({ index, row, status: "error", message: errors.join("; ") });
      return;
    }

    const key = displayKey(row.cat, row.item, row.size, row.diamDisplay, row.lengthDisplay);
    const candidates = byDisplay.get(key) ?? [];
    const exactMatch = candidates.find((p) => numEq(p.diamValue, row.diamValue) && numEq(p.lengthValue, row.lengthValue));

    if (exactMatch) {
      results.push({
        index,
        row,
        status: "existing-product",
        message: `Adds to existing product #${exactMatch.id}`,
        matchedProductId: exactMatch.id
      });
      return;
    }

    if (candidates.length > 0) {
      const conflict = candidates[0];
      results.push({
        index,
        row,
        status: "error",
        message:
          `"${row.cat} / ${row.item} / ${row.size}" (diam ${row.diamDisplay || "-"}, length ${row.lengthDisplay || "-"}) ` +
          `already exists as product #${conflict.id} with diam_value=${fmtNum(conflict.diamValue)}, ` +
          `length_value=${fmtNum(conflict.lengthValue)} - this row has diam_value=${fmtNum(row.diamValue)}, ` +
          `length_value=${fmtNum(row.lengthValue)}. Fix the value to match, or the display text if this is a different size.`
      });
      return;
    }

    const inBatch = batchCreated.get(key);
    if (inBatch && !(numEq(inBatch.diamValue, row.diamValue) && numEq(inBatch.lengthValue, row.lengthValue))) {
      results.push({
        index,
        row,
        status: "error",
        message: `Conflicts with row ${inBatch.firstIndex} in this file: same display label but a different diam/length value.`
      });
      return;
    }
    if (!inBatch) {
      batchCreated.set(key, { diamValue: row.diamValue, lengthValue: row.lengthValue, firstIndex: index });
    }

    results.push({ index, row, status: "new-product", message: "New catalog entry will be created" });
  });

  return results;
}
