import type { ParsedLine, PdfPageText, PdfWord, SupplierRules } from "../types";
import { finishSuffix, holeToDiam, isKnownHole } from "../rules";

/*
  GDPA FASTENERS packing list
  ---------------------------
  Every line item is one row of figures anchored in the far-left "W. Case No."
  column, with its description, size and order number printed to the left of and
  below that row. The columns sit at fixed x positions, so the parser keys off
  geometry rather than text order:

    x ~= 37   W. Case No.        <- the anchor for a line item
    x ~= 92   description lines, then the size line
    x ~= 23   "Buyer Order No:PO000003425, Dated : ..."
    x >= 345  Box From / To / Tot Pkgs / Qty per ctn / TOTAL QTY / weights

  A line item's description can start a couple of points ABOVE its figures, and
  its order number can spill onto the next page, so blocks are cut on y with a
  small upward tolerance and run across page breaks.

  Scanned packing lists come through OCR instead of a text layer, and OCR is
  noisier in two specific ways this parser has to allow for:
   - the case number, its description and its figures can land 5-8pt apart on
     what is really the same printed row, instead of sharing one exact y like
     a digital PDF's text does, so row-matching needs a wider tolerance; and
   - OCR reports one bounding box per WORD, not per line, so a wrapped line
     like "M.30 X 130" arrives as three separate tokens ("M.30", "X", "130")
     instead of the single string a digital PDF provides. Those tokens are
     regrouped back into whole lines (clusterTextLines) before anything is
     matched against a size or description pattern.
*/

const ANCHOR_X_MIN = 25;
const ANCHOR_X_MAX = 62;
const TEXT_X_MIN = 80;
const TEXT_X_MAX = 340;
const FIGURE_X_MIN = 340;
const ROW_Y_TOLERANCE = 8;
const BLOCK_Y_LEAD = 4;
const LINE_CLUSTER_TOLERANCE = 5;

/**
 * Figures printed to the right of the case number, left to right, once the "-"
 * separator is dropped: Box From, Box To, Tot Pkgs, Qty per ctn, TOTAL QTY,
 * Net wt per ctn, Net wt per pallet.
 */
const FIGURE_COUNT = 7;
const TOTAL_QTY_INDEX = 4;

const sortKey = (page: number, y: number) => page * 100_000 + (10_000 - y);

const isNumeric = (text: string) => /^\d+(?:\.\d+)?$/.test(text.replace(/,/g, ""));

const toNumber = (text: string) => Number(text.replace(/,/g, ""));

const flatten = (pages: PdfPageText[]): PdfWord[] =>
  pages
    .flatMap((page) => page.words)
    .map((word) => ({ ...word, text: word.text.trim() }))
    .filter((word) => word.text.length > 0)
    .sort((a, b) => sortKey(a.page, a.y) - sortKey(b.page, b.y));

/** The figures printed on the same row as a case number (see ROW_Y_TOLERANCE). */
const rowFigures = (words: PdfWord[], anchor: PdfWord) =>
  words
    .filter(
      (word) =>
        word.page === anchor.page &&
        Math.abs(word.y - anchor.y) <= ROW_Y_TOLERANCE &&
        word.x >= FIGURE_X_MIN
    )
    .sort((a, b) => a.x - b.x)
    .filter((word) => isNumeric(word.text))
    .map((word) => toNumber(word.text));

/** Whether a case number has a description sitting beside it on the same row. */
const hasNearbyDescription = (words: PdfWord[], anchor: PdfWord) =>
  words.some(
    (word) =>
      word.page === anchor.page &&
      Math.abs(word.y - anchor.y) <= ROW_Y_TOLERANCE &&
      word.x >= TEXT_X_MIN &&
      word.x <= TEXT_X_MAX
  );

const findAnchors = (words: PdfWord[]) =>
  words.filter((word) => {
    if (word.x < ANCHOR_X_MIN || word.x > ANCHOR_X_MAX) return false;
    if (!/^\d{1,3}$/.test(word.text)) return false;

    // A header number sitting in the same column has no description or
    // figures beside it - a real line item always has both, even when OCR
    // has garbled some of the figures themselves.
    return hasNearbyDescription(words, word) && rowFigures(words, word).length >= 1;
  });

/**
 * Regroups words back into whole lines. A digital PDF already hands over one
 * whole line per word (so every "cluster" here ends up holding just that one
 * word, unchanged); OCR hands over one word per box, and this stitches lines
 * like "M.30 X 130" back together from "M.30", "X", "130". Real lines of
 * description are spaced roughly 9pt or more apart, well outside
 * LINE_CLUSTER_TOLERANCE, so separate lines are not merged.
 */
const clusterTextLines = (words: PdfWord[]): string[] => {
  const sorted = [...words].sort((a, b) => b.y - a.y);
  const clusters: PdfWord[][] = [];

  for (const word of sorted) {
    const current = clusters[clusters.length - 1];
    const clusterY = current?.[0]?.y;

    if (current && clusterY !== undefined && clusterY - word.y <= LINE_CLUSTER_TOLERANCE) {
      current.push(word);
    } else {
      clusters.push([word]);
    }
  }

  return clusters.map((cluster) =>
    cluster
      .sort((a, b) => a.x - b.x)
      .map((word) => word.text)
      .join(" ")
  );
};

const SIZE_PATTERNS = {
  threaded: /^M\.?\s*(\d+(?:\.\d+)?)\s*[Xx]\s*(\d+(?:\.\d+)?)/,
  // Matches both "40 X 40 X 10MM" (one trailing MM) and "50MM X 50MM X 3MM"
  // (every number carrying its own MM suffix) - different packing lists from
  // the same supplier have used both conventions.
  plate:
    /^(\d+(?:\.\d+)?)\s*(?:MM)?\s*[Xx]\s*(\d+(?:\.\d+)?)\s*(?:MM)?\s*[Xx]\s*(\d+(?:\.\d+)?)\s*MM\b/i
};

const looksLikeSize = (text: string) =>
  SIZE_PATTERNS.threaded.test(text) || SIZE_PATTERNS.plate.test(text);

type Classified = {
  cat: string | null;
  item: string | null;
  review: string[];
};

/**
 * The hole type is printed on the size line, not in the description, so both
 * are needed to name a square washer.
 */
const classify = (description: string, rawSize: string): Classified => {
  const upper = `${description} ${rawSize}`.toUpperCase();
  const finish = finishSuffix(upper);
  const review: string[] = [];

  if (!finish) review.push("Finish not recognised in the description");

  if (/^SQ\.?\s*PLATE\s*WASHER|^SQUARE\s*PLATE\s*WASHER/.test(upper)) {
    const hole = /SQUARE\s*HOLE/.test(upper) ? "SQUARE HOLE" : "ROUND HOLE";

    if (!/ROUND\s*HOLE|SQUARE\s*HOLE/.test(upper)) {
      review.push("Hole type not stated, assumed round");
    }

    return {
      cat: "SQUARE WASHERS",
      item: finish ? `${hole} ${finish}` : null,
      review
    };
  }

  if (/^HEX\s*SCREW/.test(upper)) {
    return { cat: "ASSEMBLED", item: finish ? `ASS ${finish}` : null, review };
  }

  if (/^HEX\s*BOLT/.test(upper)) {
    return { cat: "BOLTS", item: finish ? `BOLT ${finish}` : null, review };
  }

  review.push("Description did not match any GDPA rule");
  return { cat: null, item: null, review };
};

type SizeResult = {
  diamValue: number | null;
  lengthValue: number | null;
  diamDisplay: string;
  lengthDisplay: string;
  sizeOverride: string | null;
  review: string[];
};

const parseSize = (rawSize: string, cat: string | null): SizeResult => {
  const review: string[] = [];
  const plate = rawSize.match(SIZE_PATTERNS.plate);

  if (plate) {
    const width = Number(plate[1]);
    const depth = Number(plate[2]);
    const thickness = Number(plate[3]);
    // Matches "HOLE 13" and "HOLE = 21MM" alike - only the digits are kept.
    const holeMatch = rawSize.match(/HOLE\s*[:=]?\s*(\d+(?:\.\d+)?)/i);

    if (!holeMatch) {
      review.push("Square washer has no hole size, diameter left blank");

      return {
        diamValue: null,
        lengthValue: width,
        diamDisplay: "",
        lengthDisplay: String(width),
        sizeOverride: `${width}² X ${thickness}`,
        review
      };
    }

    const hole = Number(holeMatch[1]);
    const diam = holeToDiam(hole);

    if (!isKnownHole(hole)) {
      review.push(`Hole ${hole} is not in the hole table, diameter guessed`);
    }
    if (width !== depth) {
      review.push(`Plate is ${width} x ${depth}, not square`);
    }

    return {
      diamValue: diam,
      lengthValue: width,
      diamDisplay: diam === null ? "" : String(diam),
      lengthDisplay: String(width),
      sizeOverride: `${width}² X ${thickness} X ${hole}`,
      review
    };
  }

  const threaded = rawSize.match(SIZE_PATTERNS.threaded);

  if (threaded) {
    const diam = Number(threaded[1]);
    const length = Number(threaded[2]);

    if (cat === "SQUARE WASHERS") {
      review.push("Square washer quoted as a bolt size, check the size column");
    }

    return {
      diamValue: diam,
      lengthValue: length,
      diamDisplay: String(diam),
      lengthDisplay: String(length),
      sizeOverride: null,
      review
    };
  }

  review.push("Size line could not be read");

  return {
    diamValue: null,
    lengthValue: null,
    diamDisplay: "",
    lengthDisplay: "",
    sizeOverride: null,
    review
  };
};

const parse = (pages: PdfPageText[]): ParsedLine[] => {
  const words = flatten(pages);
  const anchors = findAnchors(words);

  if (!anchors.length) return [];

  const anchorKeys = anchors.map((anchor) =>
    sortKey(anchor.page, anchor.y + BLOCK_Y_LEAD)
  );

  return anchors.map((anchor, index) => {
    const from = anchorKeys[index];
    const to = index + 1 < anchorKeys.length ? anchorKeys[index + 1] : Infinity;
    const block = words.filter((word) => {
      const key = sortKey(word.page, word.y);
      return key >= from && key < to;
    });

    // A line item's wording always sits on the same page as its figures - only
    // the order number spills over a page break - so restricting the wording to
    // the anchor's page keeps the next page's letterhead out of it.
    const textWords = block.filter(
      (word) =>
        word.page === anchor.page &&
        word.x >= TEXT_X_MIN &&
        word.x <= TEXT_X_MAX
    );
    const textLines = clusterTextLines(textWords);

    const sizeIndex = textLines.findIndex(looksLikeSize);
    const rawSize = sizeIndex === -1 ? "" : textLines[sizeIndex];
    const description = textLines
      .filter((_, i) => i !== sizeIndex)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // Looked for directly on "PO<digits>" rather than the full "Buyer Order
    // No" phrase: a digital PDF prints that phrase as one string, but OCR
    // reports one word per box ("Buyer", "Order", "No:PO000003857,"), so no
    // single OCR word ever contains the whole phrase to match against.
    const poWord = block.find((word) => /PO0*\d{3,}/i.test(word.text));
    const poMatch = poWord?.text.match(/PO0*(\d{3,})/i);

    const figures = rowFigures(words, anchor);
    const review: string[] = [];

    let qty: number | null = null;

    if (figures.length === FIGURE_COUNT) {
      qty = figures[TOTAL_QTY_INDEX];
    } else if (figures.length >= 3) {
      // The total quantity is always third from the right, ahead of the two
      // weight columns, so fall back to that when a column fails to extract.
      qty = figures[figures.length - 3];
      review.push(
        `Read ${figures.length} figures on the row, expected ${FIGURE_COUNT}`
      );
    } else {
      review.push("Quantity could not be read from the figures row");
    }

    const classified = classify(description, rawSize);
    const size = parseSize(rawSize, classified.cat);

    if (!poMatch) review.push("No buyer order number found");

    return {
      pallet: anchor.text,
      cat: classified.cat,
      item: classified.item,
      diamValue: size.diamValue,
      lengthValue: size.lengthValue,
      diamDisplay: size.diamDisplay,
      lengthDisplay: size.lengthDisplay,
      sizeOverride: size.sizeOverride,
      qty,
      po: poMatch ? poMatch[1] : "",
      description,
      rawSize,
      review: [...review, ...classified.review, ...size.review]
    };
  });
};

export const gdpa: SupplierRules = {
  id: "GDPA",
  label: "GDPA",
  ready: true,
  notes: [
    "One row per line item, anchored on the W. Case No. column at the far left.",
    "Quantity is the TOTAL QTY. column - the sixth figure on the row, third from the right.",
    "HEX BOLT becomes BOLTS / BOLT, HEX SCREW becomes ASSEMBLED / ASS, SQ PLATE WASHER becomes SQUARE WASHERS.",
    "The finish suffix comes from the description: HOT DIP GALV is HDG, ELECTRO ZINC PLATED is ZP.",
    "Sizes read as M.22 X 300, ignoring any [THREAD - 150MM] note.",
    "Square washers read as either 40 X 40 X 10MM - [ROUND HOLE 13] or 50MM X 50MM X 3MM THK [ROUND HOLE = 21MM]: the size column becomes plate² X thickness X hole, the diameter comes from the hole size and the length from the plate width.",
    "PO is taken from Buyer Order No:PO000003425 with the prefix and leading zeros stripped.",
    "Scanned (non-digital) packing lists are read by OCR, which reports one box per word instead of per line and can land a few points off a row's true position - both are allowed for, but OCR pages are still worth checking closely."
  ],
  parse
};
