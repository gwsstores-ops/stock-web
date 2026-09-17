import type { ParsedLine, PdfPageText, PdfWord, SupplierRules } from "../types";

/*
  LONG THREAD FASTENERS CORP. packing list
  -----------------------------------------
  A "PACKING LIST OF PALLET" table with one row per line item, columns at
  fixed x positions. Only four of those columns are read - everything else
  (order no., P/I no., PCS/BAG, BAG/CTN, PCS/CTN, weights, the RUSPERT finish
  text) is left out of the CSV on purpose:

    x ~110-150   PALLET NO.
    x ~300-415   the item code, eg "GCPSTR/HT60GB19" (sits inside the wider
                 "DESCRIPTION OF GOODS" column, to the right of the free-text
                 description)
    x ~415-480   the size, eg "14 X 60" or "5.5-12 X 70"
    x ~670-720   Q'TY MPCS

  Every supplier sells one product line (self-drilling hex-washer-head
  screws), so cat is always TEX SCREWS - there's nothing on the packing list
  to classify. item is read as printed, not matched against the stock list's
  item names (eg "GCPSTR/HT60GB19" vs the stock item "GCPSTRHT60") - pick the
  right one from the dropdown when checking a row.

  A pallet holding more than one product spans several rows in one merged
  PALLET NO. cell, and that cell's number is vertically centred across the
  rows it spans rather than sitting level with the first one - a 6-row
  pallet's number can print level with row 2 or 3, not row 1. Worse, this
  sample PDF's merged-cell numbers are drawn with a font pdf.js sometimes
  can't decode (its own encoding issue: '28' comes through with no text at
  all, '38' comes through as "Jo"), so centre-of-span geometry can't be
  trusted either. Rather than guess a spanning row's pallet number from
  nearby text, only a row whose number sits level with it (within
  PAL_ROW_TOLERANCE) gets one; every other row in a mixed pallet is left
  blank and flagged for manual entry.

  There is no buyer PO number on this packing list, so po is always blank.
*/

const PAL_X_MIN = 100;
const PAL_X_MAX = 150;
const ITEM_X_MIN = 300;
const ITEM_X_MAX = 415;
const SIZE_X_MIN = 415;
const SIZE_X_MAX = 480;
const QTY_X_MIN = 670;
const QTY_X_MAX = 720;

/** Above this, a word belongs to the column headers, not a data row. */
const HEADER_Y_MIN = 380;

/** How far apart two text runs can be and still be the same split field, eg
 * "GCPSTR/HT125GB" + "19" for one item code. */
const ROW_CLUSTER_TOLERANCE = 3;

/** How far a size or quantity can sit from its item code and still count as
 * the same printed row. */
const ROW_MATCH_TOLERANCE = 6;

/** Tighter, since a mixed pallet's merged number can sit close to more than
 * one of its rows - only a number printed level with a row belongs to it. */
const PAL_MATCH_TOLERANCE = 4;

const sortKey = (page: number, y: number) => page * 100_000 + (10_000 - y);

const isNumeric = (text: string) => /^[\d,]+(?:\.\d+)?$/.test(text);

const toNumber = (text: string) => Number(text.replace(/,/g, ""));

const inColumn = (word: PdfWord, min: number, max: number) => word.x >= min && word.x <= max;

type Row = { page: number; y: number; text: string };

/**
 * Some fields print as two or more separate text runs at (almost) the same y
 * - eg the item code "GCPSTR/HT125GB" + "19", or a size like "5.5-12" + "X" +
 * "70". This regroups them back into one string per row, left to right.
 */
const clusterRows = (words: PdfWord[]): Row[] => {
  const sorted = [...words].sort((a, b) => a.page - b.page || b.y - a.y);
  const groups: PdfWord[][] = [];

  for (const word of sorted) {
    const current = groups[groups.length - 1];
    const last = current?.[current.length - 1];

    if (last && last.page === word.page && Math.abs(last.y - word.y) <= ROW_CLUSTER_TOLERANCE) {
      current.push(word);
    } else {
      groups.push([word]);
    }
  }

  return groups.map((group) => ({
    page: group[0].page,
    y: group.reduce((sum, word) => sum + word.y, 0) / group.length,
    text: [...group]
      .sort((a, b) => a.x - b.x)
      .map((word) => word.text)
      .join("")
  }));
};

const nearRow = (word: PdfWord, row: Row, tolerance: number) =>
  word.page === row.page && Math.abs(word.y - row.y) <= tolerance;

const SIZE_PATTERN = /^([\d.]+(?:-[\d.]+)?)\s*X\s*([\d.]+)$/i;

const parse = (pages: PdfPageText[]): ParsedLine[] => {
  const words = pages
    .flatMap((page) => page.words)
    .map((word) => ({ ...word, text: word.text.trim() }))
    .filter((word) => word.text.length > 0 && word.y < HEADER_Y_MIN);

  const itemWords = words.filter((word) => inColumn(word, ITEM_X_MIN, ITEM_X_MAX));
  const itemRows = clusterRows(itemWords).sort(
    (a, b) => sortKey(a.page, a.y) - sortKey(b.page, b.y)
  );

  const sizeWords = words.filter((word) => inColumn(word, SIZE_X_MIN, SIZE_X_MAX));
  const qtyWords = words.filter(
    (word) => inColumn(word, QTY_X_MIN, QTY_X_MAX) && isNumeric(word.text)
  );
  const palWords = words.filter(
    (word) => inColumn(word, PAL_X_MIN, PAL_X_MAX) && /^\d{1,3}$/.test(word.text)
  );

  return itemRows.map((row) => {
    const review: string[] = [];

    const rawSize = sizeWords
      .filter((word) => nearRow(word, row, ROW_MATCH_TOLERANCE))
      .sort((a, b) => a.x - b.x)
      .map((word) => word.text)
      .join("");

    const qtyToken = qtyWords.find((word) => nearRow(word, row, ROW_MATCH_TOLERANCE));
    const qty = qtyToken ? toNumber(qtyToken.text) : null;

    if (qty === null) review.push("Quantity could not be read from the Q'TY MPCS column");

    const palToken = palWords.find((word) => nearRow(word, row, PAL_MATCH_TOLERANCE));
    const pallet = palToken?.text ?? "";

    if (!pallet) {
      review.push(
        "No pallet number level with this line - it's part of a mixed pallet, enter the number by hand"
      );
    }

    const sizeMatch = rawSize.match(SIZE_PATTERN);
    let diamValue: number | null = null;
    let lengthValue: number | null = null;
    let diamDisplay = "";
    let lengthDisplay = "";

    if (sizeMatch) {
      diamDisplay = sizeMatch[1];
      lengthDisplay = sizeMatch[2];
      diamValue = Number(sizeMatch[1].split("-")[0]);
      lengthValue = Number(sizeMatch[2]);
    } else {
      review.push("Size line could not be read");
    }

    return {
      pallet,
      cat: "TEX SCREWS",
      item: row.text || null,
      diamValue,
      lengthValue,
      diamDisplay,
      lengthDisplay,
      sizeOverride: sizeMatch ? null : rawSize,
      qty,
      po: "",
      description: "",
      rawSize,
      review
    };
  });
};

export const longThread: SupplierRules = {
  id: "LONG_THREAD",
  label: "LONG THREAD",
  ready: true,
  notes: [
    "One row per line item, read from the PALLET NO., item code, size and Q'TY MPCS columns only - everything else on the packing list (order no., PCS/BAG, BAG/CTN, PCS/CTN, weights, the RUSPERT finish note) is left out.",
    "cat is always TEX SCREWS - this supplier only sends self-drilling hex-washer-head screws, so there's nothing to classify.",
    "item is the code exactly as printed, eg GCPSTR/HT60GB19 - it isn't matched to the stock list's item names, pick the right one from the dropdown when checking a row.",
    "Sizes read as diameter X length, eg 14 X 60. A gauge-and-pitch size like 5.5-12 X 70 keeps the full 5.5-12 in diam_display, with diam_value taking just the 5.5.",
    "A pallet holding several products spans several rows under one pallet number, and that number is centred across its rows rather than level with the first one - only a row with a number printed level with it gets one; the rest of a mixed pallet's rows are left blank and flagged for manual entry.",
    "There's no buyer PO number on this packing list, so PO is always left blank.",
    "Scanned (non-digital) packing lists are read by OCR - check those pages closely, this supplier's rules haven't been tried against one yet."
  ],
  parse
};
