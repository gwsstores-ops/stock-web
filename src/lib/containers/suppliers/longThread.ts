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

  A pallet holding more than one product spans several rows under one merged
  PALLET NO. cell, and that cell's number is vertically centred across the
  rows it spans rather than sitting level with the first one - a 6-row
  pallet's number can print level with row 2 or 3, not row 1. Worse, this
  sample PDF's merged-cell numbers sometimes use a font pdf.js can't decode
  (its own encoding issue: '28' comes through with no text at all, '38'
  comes through as "Jo") - so even the number itself can't always be trusted.

  What holds regardless: pallet numbers run 1, 2, 3... with no gaps or
  repeats, in the same top-to-bottom order as the rows. So the number printed
  on a row is only ever used to work out where one pallet's block of rows
  ends and the next begins (assignPalletBlocks, below, does this with a
  small dynamic program that also copes with a block whose number is
  missing entirely, like pallet 28 in the sample) - the actual pallet value
  written to the CSV comes from counting blocks in order, not from decoding
  the number's text. A row whose block's own printed number IS legible and
  disagrees with that count gets flagged rather than trusted blindly.
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

/**
 * The cost of treating a run of rows as one pallet block nobody's number was
 * legible for, instead of stretching a neighbouring block's match to cover
 * for it. Comfortably more than a genuine match ever costs (a real match is
 * usually under 1, since a block's number sits close to its own rows'
 * average) but well under the cost of folding a whole extra block's rows
 * into its neighbours - checked against the sample packing list, where
 * absorbing pallet 28's two rows into 27 and 29 instead of leaving them as
 * their own unlabelled block would otherwise come out cheaper.
 */
const UNLABELLED_BLOCK_COST = 8;

/**
 * Splits one page's item rows into pallet blocks. rowYs are the item rows'
 * y positions in reading order; labelYs are the pallet-column anchors found
 * on the same page, in reading order - their text isn't used here, only
 * their position, since it can't always be read (see file header comment).
 *
 * This is a small dynamic program: it finds the partition of rowYs into
 * contiguous runs that best lines each run's average y up with the labels,
 * in order, allowing any run to instead go unmatched (cost
 * UNLABELLED_BLOCK_COST) when no label fits it well - which is what happens
 * for a block whose number didn't extract at all. Runtime is
 * O(rows^2 x labels), trivial at this table's size.
 *
 * Returns the 0-based block index for every row, in the same order as rowYs.
 */
const assignPalletBlocks = (rowYs: number[], labelYs: number[]): number[] => {
  const n = rowYs.length;
  const m = labelYs.length;

  if (n === 0) return [];

  const prefix = [0];
  for (const y of rowYs) prefix.push(prefix[prefix.length - 1] + y);
  const average = (from: number, to: number) => (prefix[to] - prefix[from]) / (to - from);

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
  const back: ({ k: number; matched: boolean } | null)[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(null)
  );

  dp[0][0] = 0;

  for (let i = 1; i <= n; i += 1) {
    for (let j = 0; j <= m; j += 1) {
      for (let k = 0; k < i; k += 1) {
        if (j >= 1 && dp[k][j - 1] !== Infinity) {
          const cost = dp[k][j - 1] + Math.abs(average(k, i) - labelYs[j - 1]);

          if (cost < dp[i][j]) {
            dp[i][j] = cost;
            back[i][j] = { k, matched: true };
          }
        }

        if (dp[k][j] !== Infinity) {
          const cost = dp[k][j] + UNLABELLED_BLOCK_COST;

          if (cost < dp[i][j]) {
            dp[i][j] = cost;
            back[i][j] = { k, matched: false };
          }
        }
      }
    }
  }

  // Every label must end up used and every row assigned - if that's not
  // reachable (shouldn't happen once at least one label is on the page),
  // fall back to a single unlabelled block covering the whole page.
  if (dp[n][m] === Infinity) return rowYs.map(() => 0);

  const boundaries: number[] = [];
  let i = n;
  let j = m;

  while (i > 0) {
    const step = back[i][j];
    if (!step) break;

    boundaries.push(i);
    i = step.k;
    if (step.matched) j -= 1;
  }

  boundaries.push(0);
  boundaries.reverse(); // now [0, ...cut points..., n]

  const blockOfRow = new Array<number>(n);
  for (let b = 0; b < boundaries.length - 1; b += 1) {
    for (let r = boundaries[b]; r < boundaries[b + 1]; r += 1) {
      blockOfRow[r] = b;
    }
  }

  return blockOfRow;
};

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
  const palRows = clusterRows(words.filter((word) => inColumn(word, PAL_X_MIN, PAL_X_MAX)));

  // Work out pallet blocks one page at a time - a mixed pallet's rows never
  // cross a page break on this supplier's packing lists.
  const pageNumbers = [...new Set(itemRows.map((row) => row.page))].sort((a, b) => a - b);
  const palletByRowIndex = new Map<number, string>();
  const mismatchByRowIndex = new Map<number, string>();
  let nextPallet = 1;

  for (const page of pageNumbers) {
    const rowsOnPage = itemRows
      .map((row, index) => ({ row, index }))
      .filter((entry) => entry.row.page === page);
    const labelsOnPage = palRows.filter((label) => label.page === page);

    const blocks = assignPalletBlocks(
      rowsOnPage.map((entry) => entry.row.y),
      labelsOnPage.map((label) => label.y)
    );

    const blockCount = blocks.length ? Math.max(...blocks) + 1 : 0;
    const blockRowIndices: number[][] = Array.from({ length: blockCount }, () => []);
    blocks.forEach((block, i) => blockRowIndices[block].push(i));

    for (let block = 0; block < blockCount; block += 1) {
      const pallet = String(nextPallet);
      nextPallet += 1;

      const indices = blockRowIndices[block];
      const avgY =
        indices.reduce((sum, i) => sum + rowsOnPage[i].row.y, 0) / indices.length;

      // Purely to cross check a legible printed number against the
      // sequential count - doesn't affect which rows belong to this block.
      const closestLabel = labelsOnPage.reduce<Row | null>((best, label) => {
        if (!best) return label;
        return Math.abs(label.y - avgY) < Math.abs(best.y - avgY) ? label : best;
      }, null);

      const mismatchNote =
        closestLabel &&
        Math.abs(closestLabel.y - avgY) < UNLABELLED_BLOCK_COST &&
        /^\d{1,3}$/.test(closestLabel.text) &&
        closestLabel.text !== pallet
          ? `The PDF prints ${closestLabel.text} near this block, but counting pallets in order gives ${pallet} - check which is right`
          : null;

      for (const i of indices) {
        const rowIndex = rowsOnPage[i].index;
        palletByRowIndex.set(rowIndex, pallet);
        if (mismatchNote) mismatchByRowIndex.set(rowIndex, mismatchNote);
      }
    }
  }

  return itemRows.map((row, index) => {
    const review: string[] = [];

    const rawSize = sizeWords
      .filter((word) => nearRow(word, row, ROW_MATCH_TOLERANCE))
      .sort((a, b) => a.x - b.x)
      .map((word) => word.text)
      .join("");

    const qtyToken = qtyWords.find((word) => nearRow(word, row, ROW_MATCH_TOLERANCE));
    const qty = qtyToken ? toNumber(qtyToken.text) : null;

    if (qty === null) review.push("Quantity could not be read from the Q'TY MPCS column");

    const pallet = palletByRowIndex.get(index) ?? "";
    const mismatch = mismatchByRowIndex.get(index);
    if (mismatch) review.push(mismatch);

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
    "A pallet holding several products spans several rows under one merged pallet number, and that number is centred across its rows rather than level with the first one - sometimes it doesn't extract at all. Pallet numbers are assumed to run 1, 2, 3... with no gaps, and that count (not the printed digits) is what's written to the CSV; a row is flagged if the PDF's own printed number disagrees with the count.",
    "There's no buyer PO number on this packing list, so PO is always left blank.",
    "Scanned (non-digital) packing lists are read by OCR - check those pages closely, this supplier's rules haven't been tried against one yet."
  ],
  parse
};
