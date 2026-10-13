import type { ParsedLine, PdfPageText, PdfWord, SupplierRules } from "../types";
import { finishSuffix } from "../rules";

/*
  JIANGSU YONGYI FASTENER CO., LTD packing list
  ----------------------------------------------
  One row per line item, in a plain grid with every field on its own line at a
  fixed x position - no merged cells, no OCR needed on the sample PDF (it's a
  digital text layer):

    x ~16    PALLET NO.   eg "12#"
    x ~57    ORDER NO.    eg "PO000004026"
    x ~117   Type         eg "1PCS DIN931/1PCS DIN934", "DIN960",
                           "1PCS ISO4017/1PCS ISO4032/1PCS ISO7091"
    x ~211   Grade        eg "8.8", "10.9"
    x ~242   Surface      eg "HDG", "ZP", "black oxide"
    x ~281   SIZE         eg "M20X375", "M24X2X230"
    x ~382   QTY/PCS

  A long Type or Order No can run past the column width and wrap onto the
  line directly below, with no pallet number of its own on that second line
  (eg order "PO000002566-OCT" and type "1PCS ISO4017/1PCS" + "ISO4032/1PCS
  ISO7091"). The PO number itself always finishes on the first line, so only
  Type needs the wrapped line folded back in before it's classified.

  A pallet carrying two separate batches of the exact same product - a full
  run of cartons plus one odd leftover carton, say - gets two line items
  under the same pallet number instead of one. The footer's "Total Pallet"
  count matches the number of DISTINCT pallet numbers, not the number of
  rows, so matching rows for the same pallet are summed into a single line
  (mergeDuplicatePallets, below) before anything is handed back.
*/

const PALLET_X_MIN = 10;
const PALLET_X_MAX = 50;
const ORDER_X_MIN = 50;
const ORDER_X_MAX = 110;
const TYPE_X_MIN = 110;
const TYPE_X_MAX = 205;
const GRADE_X_MIN = 205;
const GRADE_X_MAX = 235;
const SURFACE_X_MIN = 235;
const SURFACE_X_MAX = 275;
const SIZE_X_MIN = 275;
const SIZE_X_MAX = 325;
const QTY_X_MIN = 375;
const QTY_X_MAX = 410;

/** How close a word's y has to be to an anchor's to count as the same printed row. */
const ROW_Y_TOLERANCE = 2;

/**
 * Fallback reach below the last row on the page, when there's no next anchor
 * to bound the search against. Rows are about 8.5pt apart on this packing
 * list, so one row's worth comfortably reaches a wrapped continuation line
 * without running on indefinitely into the footer.
 */
const CONTINUATION_Y_FALLBACK = 10;

const PALLET_PATTERN = /^(\d+)#$/;

const sortKey = (page: number, y: number) => page * 100_000 + (10_000 - y);

const isNumeric = (text: string) => /^[\d,]+(?:\.\d+)?$/.test(text);

const toNumber = (text: string) => Number(text.replace(/,/g, ""));

const inColumn = (word: PdfWord, min: number, max: number) => word.x >= min && word.x <= max;

const sameRow = (word: PdfWord, anchor: PdfWord) =>
  word.page === anchor.page && Math.abs(word.y - anchor.y) <= ROW_Y_TOLERANCE;

/**
 * The anchor's own row plus any wrapped continuation line below it - but
 * never as far down as the next pallet's own row. A continuation line sits
 * about as far below its anchor as the next row does (both are one line
 * height away), so the next anchor's own y is used as the lower bound
 * instead of a fixed distance.
 */
const belowRow = (word: PdfWord, anchor: PdfWord, nextAnchorY: number | null) => {
  if (word.page !== anchor.page) return false;
  if (word.y > anchor.y + ROW_Y_TOLERANCE) return false;

  const lowerBound = nextAnchorY !== null ? nextAnchorY : anchor.y - CONTINUATION_Y_FALLBACK;
  return word.y > lowerBound;
};

type Classified = {
  cat: string | null;
  item: string | null;
  review: string[];
};

const classify = (type: string, grade: string, surface: string): Classified => {
  const upperType = type.toUpperCase().replace(/\s+/g, "");
  const finish = finishSuffix(surface);
  const review: string[] = [];

  if (!finish) review.push(`Surface "${surface}" not recognised`);

  if (upperType.includes("ISO4017") && upperType.includes("ISO4032") && upperType.includes("ISO7091")) {
    return { cat: "ASSEMBLED", item: finish ? `ASS ${finish}` : null, review };
  }

  if (upperType.includes("DIN960") && !upperType.includes("DIN931") && !upperType.includes("DIN933")) {
    return { cat: "BOLTS", item: finish ? `DIN960 ${grade} ${finish}` : null, review };
  }

  if ((upperType.includes("DIN931") || upperType.includes("DIN933")) && upperType.includes("DIN934")) {
    return { cat: "BOLTS", item: finish ? `BOLT ${finish}` : null, review };
  }

  review.push(`Type "${type}" not recognised`);
  return { cat: null, item: null, review };
};

const THREE_PART_SIZE = /^M(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/i;
const TWO_PART_SIZE = /^M(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/i;

type SizeResult = {
  diamValue: number | null;
  lengthValue: number | null;
  diamDisplay: string;
  lengthDisplay: string;
  review: string[];
};

/** A fine-thread size prints as diameter X pitch X length, eg M24X2X230 - the pitch is dropped. */
const parseSize = (rawSize: string): SizeResult => {
  const threePart = rawSize.match(THREE_PART_SIZE);

  if (threePart) {
    return {
      diamValue: Number(threePart[1]),
      lengthValue: Number(threePart[3]),
      diamDisplay: threePart[1],
      lengthDisplay: threePart[3],
      review: []
    };
  }

  const twoPart = rawSize.match(TWO_PART_SIZE);

  if (twoPart) {
    return {
      diamValue: Number(twoPart[1]),
      lengthValue: Number(twoPart[2]),
      diamDisplay: twoPart[1],
      lengthDisplay: twoPart[2],
      review: []
    };
  }

  return {
    diamValue: null,
    lengthValue: null,
    diamDisplay: "",
    lengthDisplay: "",
    review: ["Size could not be read from the SIZE column"]
  };
};

/** What makes two lines "the same pallet's same product" for merging split batches. */
const mergeKey = (line: ParsedLine) =>
  [line.pallet, line.cat, line.item, line.diamValue, line.lengthValue].join("|");

const mergeDuplicatePallets = (lines: ParsedLine[]): ParsedLine[] => {
  const merged = new Map<string, ParsedLine>();

  for (const line of lines) {
    const key = mergeKey(line);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...line });
      continue;
    }

    existing.qty = existing.qty === null && line.qty === null ? null : (existing.qty ?? 0) + (line.qty ?? 0);

    if (existing.po !== line.po) {
      existing.review.push(`Pallet ${line.pallet} has rows with different order numbers (${existing.po || "blank"} / ${line.po || "blank"})`);
    }

    for (const note of line.review) {
      if (!existing.review.includes(note)) existing.review.push(note);
    }
  }

  return [...merged.values()];
};

const parse = (pages: PdfPageText[]): ParsedLine[] => {
  const words = pages
    .flatMap((page) => page.words)
    .map((word) => ({ ...word, text: word.text.trim() }))
    .filter((word) => word.text.length > 0);

  const anchors = words
    .filter((word) => inColumn(word, PALLET_X_MIN, PALLET_X_MAX) && PALLET_PATTERN.test(word.text))
    .sort((a, b) => sortKey(a.page, a.y) - sortKey(b.page, b.y));

  const typeWords = words.filter((word) => inColumn(word, TYPE_X_MIN, TYPE_X_MAX));
  const orderWords = words.filter((word) => inColumn(word, ORDER_X_MIN, ORDER_X_MAX));
  const gradeWords = words.filter((word) => inColumn(word, GRADE_X_MIN, GRADE_X_MAX));
  const surfaceWords = words.filter((word) => inColumn(word, SURFACE_X_MIN, SURFACE_X_MAX));
  const sizeWords = words.filter((word) => inColumn(word, SIZE_X_MIN, SIZE_X_MAX));
  const qtyWords = words.filter(
    (word) => inColumn(word, QTY_X_MIN, QTY_X_MAX) && isNumeric(word.text)
  );

  const lines = anchors.map((anchor, index) => {
    const review: string[] = [];
    const pallet = anchor.text.match(PALLET_PATTERN)![1];

    const nextAnchor = anchors[index + 1];
    const nextAnchorY = nextAnchor && nextAnchor.page === anchor.page ? nextAnchor.y : null;

    const type = typeWords
      .filter((word) => belowRow(word, anchor, nextAnchorY))
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((word) => word.text)
      .join(" ");

    const orderWord = orderWords.find((word) => sameRow(word, anchor));
    const poMatch = orderWord?.text.match(/^PO\d+/i);
    if (!poMatch) review.push("No order number found");

    const gradeWord = gradeWords.find((word) => sameRow(word, anchor));
    const grade = gradeWord?.text ?? "";
    if (!grade) review.push("Grade not found");

    const surfaceWord = surfaceWords.find((word) => sameRow(word, anchor));
    const surface = surfaceWord?.text ?? "";

    const sizeWord = sizeWords.find((word) => sameRow(word, anchor));
    const rawSize = sizeWord?.text ?? "";

    const qtyWord = qtyWords.find((word) => sameRow(word, anchor));
    const qty = qtyWord ? toNumber(qtyWord.text) : null;
    if (qty === null) review.push("Quantity could not be read from the QTY/PCS column");

    const classified = classify(type, grade, surface);
    const size = parseSize(rawSize);

    return {
      pallet,
      cat: classified.cat,
      item: classified.item,
      diamValue: size.diamValue,
      lengthValue: size.lengthValue,
      diamDisplay: size.diamDisplay,
      lengthDisplay: size.lengthDisplay,
      sizeOverride: null,
      qty,
      po: poMatch ? poMatch[0].toUpperCase() : "",
      description: "",
      rawSize,
      review: [...review, ...classified.review, ...size.review]
    };
  });

  return mergeDuplicatePallets(lines);
};

export const yonghi: SupplierRules = {
  id: "YONGHI",
  label: "YONGHI",
  ready: true,
  notes: [
    "One row per line item, read from the PALLET NO., ORDER NO., Type, Grade, Surface, SIZE and QTY/PCS columns.",
    "1PCS DIN931/1PCS DIN934 and 1PCS DIN933/1PCS DIN934 (a hex bolt plus nut) both become BOLTS / BOLT. 1PCS ISO4017/1PCS ISO4032/1PCS ISO7091 (bolt, nut and washer together) becomes ASSEMBLED / ASS. A standalone DIN960 (no nut) becomes BOLTS / DIN960, with its Grade column kept in the item name since this supplier only sends it at a grade other than the usual 8.8.",
    "The finish suffix comes from the Surface column: HDG stays HDG, ZP stays ZP, black oxide becomes SC.",
    "Sizes read as diameter X length, eg M20X375 becomes 20 X 375. A fine-thread size prints as diameter X pitch X length, eg M24X2X230 - the middle pitch figure is dropped, giving 24 X 230.",
    "PO is the ORDER NO. column exactly as printed, eg PO000004026 - not stripped to bare digits like some other suppliers' rules.",
    "A long Type or Order No. can wrap onto the line below with no pallet number of its own - the wrapped Type text is folded back in before classifying; the wrapped Order No. text is a note (eg -OCT) and is dropped, since the PO number itself always finishes on the first line.",
    "A pallet that appears on two rows with the exact same product (eg a full run of cartons plus one leftover part-carton) is summed into a single row, since the packing list's own pallet count only counts it once.",
    "Scanned (non-digital) packing lists are read by OCR - check those pages closely, this supplier's rules haven't been tried against one yet."
  ],
  parse
};
