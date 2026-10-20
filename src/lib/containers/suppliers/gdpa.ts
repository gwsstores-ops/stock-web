import type { ParsedLine, PdfPageText, PdfWord, SupplierRules } from "../types";
import { finishSuffix } from "../rules";

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

  OCR also drops and garbles individual figures and digits (126ES: case
  numbers 21-23 read as "2", TOTAL QTY missing outright, "PO 3669" split over
  two words), so nothing is trusted from a single reading:
   - each figure is placed in its column by x position (columns found from the
     two "PCS" header words on each page), not by counting figures left to
     right, so one missing figure no longer shifts every other one along;
   - the quantity is cross-checked between TOTAL QTY, Tot Pkgs x Qty per ctn,
     (Box To - Box From + 1) x Qty per ctn and the subtotal printed under the
     line, and the value most of them agree on wins;
   - case numbers run 1, 2, 3... up to the "1-34 wooden cases" count, so a
     reading that has lost a digit is put back in sequence; and
   - the Buyer Part code (eg 933CEASS16X040, SQWG50X50X05X21) repeats the size,
     so it stands in when the OCR'd size line is missing or disagrees.
*/

const ANCHOR_X_MIN = 25;
const ANCHOR_X_MAX = 62;
const TEXT_X_MIN = 80;
const TEXT_X_MAX = 340;
const FIGURE_X_MIN = 340;
const ROW_Y_TOLERANCE = 8;
const BLOCK_Y_LEAD = 4;
const LINE_CLUSTER_TOLERANCE = 5;

/** How far a figure can sit from its column's centre and still be read as in it. */
const COLUMN_TOLERANCE = 15;

/**
 * The figure columns right of the description, as offsets from the two "PCS"
 * header words (over Qty per ctn and TOTAL QTY). Measured off both the digital
 * GD78ES list and the scanned 126ES and GD96ES lists, whose scans sit a few
 * points away from the digital layout and from each other.
 */
type Column = "from" | "to" | "pkgs" | "perCtn" | "total" | "netCtn" | "netPallet";

const columnCentres = (perCtnPcs: number, totalPcs: number): Record<Column, number> => {
  const perCtn = perCtnPcs + 5;
  const total = totalPcs + 4;

  return {
    from: perCtn - 92,
    to: perCtn - 63,
    pkgs: perCtn - 28,
    perCtn,
    total,
    netCtn: total + 31,
    netPallet: total + 60
  };
};

/** The digital layout's "PCS" positions, used when a page's header won't read. */
const DEFAULT_PCS: [number, number] = [448, 485];

const sortKey = (page: number, y: number) => page * 100_000 + (10_000 - y);

const isNumeric = (text: string) => /^\d+(?:\.\d+)?$/.test(text.replace(/,/g, ""));

const toNumber = (text: string) => Number(text.replace(/,/g, ""));

/**
 * The number inside an OCR'd figure, ignoring a table rule or bracket read as
 * part of it ("36]", "40|", "{1") - null when what's left isn't a number.
 */
const figureValue = (text: string): number | null => {
  const match = text.match(/^[^\d]{0,2}(\d[\d,]*(?:\.\d+)?)[^\d]{0,2}$/);
  return match && isNumeric(match[1]) ? toNumber(match[1]) : null;
};

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
    .filter((word) => figureValue(word.text) !== null);

/** Whether a case number has a description sitting beside it on the same row. */
const hasNearbyDescription = (words: PdfWord[], anchor: PdfWord) =>
  words.some(
    (word) =>
      word.page === anchor.page &&
      Math.abs(word.y - anchor.y) <= ROW_Y_TOLERANCE &&
      word.x >= TEXT_X_MIN &&
      word.x <= TEXT_X_MAX
  );

/** Whether a row opens with one of the item descriptions classify() knows. */
const startsItem = (words: PdfWord[], anchor: PdfWord) =>
  words.some(
    (word) =>
      word.page === anchor.page &&
      Math.abs(word.y - anchor.y) <= ROW_Y_TOLERANCE &&
      word.x >= TEXT_X_MIN &&
      word.x <= TEXT_X_MIN + 50 &&
      /^(HEX|SQ|SQUARE|THREADED|U[\s-]*BOLT)/i.test(word.text)
  );

const findAnchors = (words: PdfWord[]) => {
  const candidates = words.filter((word) => {
    if (word.x < ANCHOR_X_MIN || word.x > ANCHOR_X_MAX) return false;
    if (!/^\S{1,3}$/.test(word.text)) return false;

    // A header number sitting in the same column has no description or
    // figures beside it - a real line item always has both, even when OCR
    // has garbled some of the figures themselves.
    if (!hasNearbyDescription(words, word)) return false;

    const hasFigures = rowFigures(words, word).length > 0;

    // OCR can garble a case number ("2%", or just "%" for 26), so a short
    // reading without a digit still counts when the row plainly opens a line
    // item - resolveCaseNumbers puts it back in sequence. Likewise a real
    // case number counts even when OCR lost every figure on its row.
    return /\d/.test(word.text)
      ? hasFigures || startsItem(words, word)
      : hasFigures && startsItem(words, word);
  });

  // A table rule OCR'd as "|" can sit beside the real case number; keep one
  // reading per row, preferring the one with a digit in it.
  return candidates.filter(
    (word) =>
      /\d/.test(word.text) ||
      !candidates.some(
        (other) =>
          other !== word &&
          other.page === word.page &&
          Math.abs(other.y - word.y) <= ROW_Y_TOLERANCE &&
          /\d/.test(other.text)
      )
  );
};

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

/**
 * The figure columns on each page, keyed by page number. A page whose "PCS"
 * header can't be read borrows the nearest earlier page's columns.
 */
const findColumns = (pages: PdfPageText[]) => {
  const columns = new Map<number, Record<Column, number>>();
  let last = columnCentres(...DEFAULT_PCS);

  for (const page of [...pages].sort((a, b) => a.page - b.page)) {
    const pcs = page.words
      .filter((word) => /^PCS$/i.test(word.text.trim()) && word.x > 400 && word.x < 530)
      .sort((a, b) => a.x - b.x);
    const pair = pcs.find((left) =>
      pcs.some(
        (right) =>
          right.x - left.x >= 25 &&
          right.x - left.x <= 50 &&
          Math.abs(right.y - left.y) <= ROW_Y_TOLERANCE
      )
    );

    if (pair) {
      const right = pcs.find((word) => word.x - pair.x >= 25 && word.x - pair.x <= 50)!;
      last = columnCentres(pair.x, right.x);
    }

    columns.set(page.page, last);
  }

  return columns;
};

/** Each figure on a row, placed in the column it sits closest to. */
const readRow = (
  figures: PdfWord[],
  centres: Record<Column, number>,
  rowY: number
): Partial<Record<Column, number>> => {
  const best = new Map<Column, { value: number; dy: number }>();

  for (const word of figures) {
    const value = figureValue(word.text);
    if (value === null) continue;

    const [column, distance] = (Object.entries(centres) as [Column, number][])
      .map(([name, x]) => [name, Math.abs(word.x - x)] as const)
      .sort((a, b) => a[1] - b[1])[0];

    if (distance > COLUMN_TOLERANCE) continue;

    const dy = Math.abs(word.y - rowY);
    const current = best.get(column);
    if (!current || dy < current.dy) best.set(column, { value, dy });
  }

  return Object.fromEntries(
    [...best.entries()].map(([column, { value }]) => [column, value])
  );
};

type QtyChoice = {
  qty: number | null;
  /** Whether at least two of the line's own readings agree on qty. */
  confirmed: boolean;
  /** The carton counts read for the line (Tot Pkgs and Box To - From + 1). */
  cartons: number[];
};

/**
 * Picks the quantity most of the line's readings agree on. TOTAL QTY wins a
 * tie, as the figure printed for exactly this purpose.
 */
const chooseQty = (
  row: Partial<Record<Column, number>>,
  subtotal: number | null
): QtyChoice => {
  const { from, to, pkgs, perCtn, total } = row;
  const boxes = from !== undefined && to !== undefined && to >= from ? to - from + 1 : undefined;
  const cartons = [pkgs, boxes].filter((value): value is number => value !== undefined && value > 0);

  // Both carton counts are multiplied by the same Qty per ctn, so when they
  // agree they're one reading, not two - otherwise a single misread Qty per
  // ctn would outvote a correct TOTAL QTY. In tie-break order: the subtotal
  // comes last, being the reading most likely to have picked up a
  // neighbouring line's figure instead.
  const readings = [
    total,
    ...[...new Set(cartons)].map((count) => (perCtn !== undefined ? count * perCtn : undefined)),
    subtotal ?? undefined
  ].filter((value): value is number => value !== undefined && value > 0);

  if (!readings.length) return { qty: null, confirmed: false, cartons };

  const votes = readings.map((value) => readings.filter((other) => other === value).length);
  const top = Math.max(...votes);

  return { qty: readings[votes.indexOf(top)], confirmed: top >= 2, cartons };
};

/**
 * A line whose own figures don't agree borrows the quantity of a confirmed
 * line for the same item packed in the same number of cartons - on a GDPA list
 * those always carry the same total (126ES cases 8-14 are all 45 cartons of 6).
 */
const settleQty = (
  choice: QtyChoice,
  product: string,
  others: { pallet: string; product: string; choice: QtyChoice }[]
): { qty: number | null; review: string[] } => {
  if (choice.confirmed) return { qty: choice.qty, review: [] };

  const peer = others.find(
    (other) =>
      other.choice.confirmed &&
      other.product === product &&
      other.choice.cartons.some((count) => choice.cartons.includes(count))
  );

  if (peer && peer.choice.qty === choice.qty) return { qty: choice.qty, review: [] };

  if (peer) {
    return {
      qty: peer.choice.qty,
      review: [
        choice.qty === null
          ? `Quantity unreadable, taken as ${peer.choice.qty} from case ${peer.pallet} (same item and carton count)`
          : `Quantity read as ${choice.qty}, taken as ${peer.choice.qty} from case ${peer.pallet} (same item and carton count)`
      ]
    };
  }

  return {
    qty: choice.qty,
    review: [
      choice.qty === null
        ? "Quantity could not be read from the figures row"
        : `Quantity ${choice.qty} could not be cross-checked against the other figures on the row`
    ]
  };
};

/** The "1-34 wooden cases" count from the header - the highest case number. */
const findCaseCount = (words: PdfWord[]): number | null => {
  for (const word of words) {
    const inline = word.text.match(/^1\s*-\s*(\d{1,3})\s+wooden/i);
    if (inline) return Number(inline[1]);

    const split = word.text.match(/^1\s*-\s*(\d{1,3})$/);
    const next = split
      ? words.find(
          (other) =>
            other.page === word.page &&
            Math.abs(other.y - word.y) <= 3 &&
            other.x > word.x &&
            other.x - word.x < 40
        )
      : undefined;
    if (split && next && /^wooden/i.test(next.text)) return Number(split[1]);
  }

  return null;
};

type CaseNumber = { pallet: string; review: string[] };

/**
 * Case numbers run 1, 2, 3... up to the wooden-case count, followed by any
 * part-cases topping up an earlier case (their Box From is past 1, eg "26 -
 * 31"). Within the run, a reading that is garbled or has lost a digit ("2"
 * for 21) is replaced with the next number in sequence.
 */
const resolveCaseNumbers = (
  anchors: PdfWord[],
  boxFrom: (number | undefined)[],
  caseCount: number | null
): CaseNumber[] => {
  let previous = 0;

  return anchors.map((anchor, index) => {
    const digits = anchor.text.replace(/\D/g, "");
    const expected = previous + 1;
    const inRun =
      (caseCount === null || expected <= caseCount) && (boxFrom[index] ?? 1) <= 1;
    const garbled = !/^\d+$/.test(anchor.text);
    const lostDigit =
      digits !== String(expected) && String(expected).includes(digits);

    if (inRun && (garbled || lostDigit)) {
      previous = expected;
      return {
        pallet: String(expected),
        review: [`Case number read as "${anchor.text}", taken as ${expected} from the sequence`]
      };
    }

    previous = Number(digits);
    return {
      pallet: String(Number(digits)),
      review: garbled ? [`Case number read as "${anchor.text}"`] : []
    };
  });
};

/**
 * "Buyer Order No:PO000003857" or "No:PO 3669" - OCR splits the second over
 * two words and reads the O and zeros as any of O, 0, D, G or Q, so the words
 * around "PO" are joined and those letters read as zeros before matching.
 */
const readPo = (block: PdfWord[]): string => {
  const start = block.findIndex((word) => /P[O0Q]/i.test(word.text) && /No|^P/i.test(word.text));
  if (start === -1) return "";

  const word = block[start];
  const next = block
    .filter(
      (other) =>
        other.page === word.page &&
        Math.abs(other.y - word.y) <= 3 &&
        other.x > word.x &&
        other.x - word.x < 40
    )
    .sort((a, b) => a.x - b.x)[0];

  const joined = `${word.text} ${next?.text ?? ""}`.toUpperCase();
  const afterP = joined.slice(joined.search(/P[O0Q]/));
  const normalised = afterP.slice(1).replace(/^[\sODGQ0]+/, (zeros) => zeros.replace(/\S/g, "0"));
  const match = normalised.match(/^[\s0]*(\d{3,})/);

  return match ? match[1] : "";
};

/**
 * The size as repeated in the Buyer Part code, with the letters OCR mistakes
 * for digits put back: "931G20X550-150" or "933CEASS16X040" give 20 x 550 and
 * 16 x 40, "SQWG50X50X05X21" gives a 50 x 50 x 5 plate with a 21 hole.
 */
const partCodeSize = (block: PdfWord[], washer: boolean): string | null => {
  const partIndex = block.findIndex((word) => /^Part$/i.test(word.text) || /Part\s*:/i.test(word.text));
  if (partIndex === -1) return null;

  const part = block[partIndex];
  const code = block
    .filter(
      (word) =>
        word.page === part.page &&
        Math.abs(word.y - part.y) <= 3 &&
        word.x >= part.x &&
        word.x - part.x < 40
    )
    .map((word) => word.text)
    .join(" ")
    .replace(/^.*?:/, "")
    .toUpperCase();

  const digit = (text: string) => Number(text.replace(/O/g, "0").replace(/S/g, "5").replace(/[IL]/g, "1"));

  if (washer) {
    // OCR can slip an extra letter in after the QW ("SQWGS50X50X03X21").
    const plate = code.match(/QW[A-Z]{0,2}?([\dSO]{2})X([\dSO]{2})X([\dSO]{1,2})X([\dSO]{1,2})\b/);
    if (!plate) return null;

    const [width, depth, thickness, hole] = plate.slice(1).map(digit);
    return `${width}MM X ${depth}MM X ${thickness}MM [HOLE = ${hole}MM]`;
  }

  const threaded = code.match(/([\dO]{1,2})X([\dOS]{2,4})(?:\s*[-/]\s*\d+)?\s*$/);
  return threaded ? `M.${digit(threaded[1])} X ${digit(threaded[2])}` : null;
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

  if (/^THREADED\s*STUD/.test(upper)) {
    return { cat: "OTHER", item: finish ? `STUD ${finish}` : null, review };
  }

  if (/^U[\s-]*BOLT/.test(upper)) {
    // The reach (a third dimension beyond diameter and length) and its S/L
    // tag come from a pipe-diameter reference table, not from anything
    // printed on the packing list - left for manual entry every time.
    review.push("U-bolt reach and (S)/(L) tag are not on the packing list, add by hand");
    return { cat: "U/J/C BOLTS", item: finish ? `U BOLT ${finish}` : null, review };
  }

  if (/^SQ\.?\s*SQ\.?\s*BOLT|^SQUARE\s*BOLT/.test(upper)) {
    return { cat: "HOLDING DOWN BOLTS", item: finish ? `HDB ${finish}` : null, review };
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

    if (width !== depth) {
      review.push(`Plate is ${width} x ${depth}, not square`);
    }

    return {
      // diam_value is the hole size itself - square washers aren't quoted by
      // an equivalent bolt diameter, and no conversion is applied.
      diamValue: hole,
      lengthValue: width,
      diamDisplay: String(hole),
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
  const columns = findColumns(pages);
  const ocrPages = new Set(pages.filter((page) => page.ocr).map((page) => page.page));
  const rows = anchors.map((anchor) =>
    readRow(rowFigures(words, anchor), columns.get(anchor.page)!, anchor.y)
  );
  const caseNumbers = resolveCaseNumbers(
    anchors,
    rows.map((row) => row.from),
    findCaseCount(words)
  );

  const lines = anchors.map((anchor, index) => {
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
    const printedSize = sizeIndex === -1 ? "" : textLines[sizeIndex];
    const description = textLines
      .filter((_, i) => i !== sizeIndex)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const review: string[] = [...caseNumbers[index].review];

    // The subtotal is printed in the TOTAL QTY column a line or two under the
    // item - possibly at the top of the next page - and well clear of the
    // next item's own row.
    const centres = columns.get(anchor.page)!;
    const subtotalEnd =
      index + 1 < anchors.length
        ? sortKey(anchors[index + 1].page, anchors[index + 1].y + 2 * ROW_Y_TOLERANCE)
        : Infinity;
    const subtotalWord = block.find((word) => {
      const key = sortKey(word.page, word.y);
      const pageCentres = columns.get(word.page) ?? centres;
      return (
        key > sortKey(anchor.page, anchor.y - ROW_Y_TOLERANCE) &&
        key < subtotalEnd &&
        Math.abs(word.x - pageCentres.total) <= COLUMN_TOLERANCE &&
        figureValue(word.text) !== null
      );
    });
    const quantity = chooseQty(
      rows[index],
      subtotalWord ? figureValue(subtotalWord.text) : null
    );

    let classified = classify(description, printedSize);
    let rawSize = printedSize;
    let size = parseSize(rawSize, classified.cat);

    // Only bolts, screws and square washers have part codes this reads; the
    // printed size line is trusted on a digital page, where it can't be misread.
    const partSize = ["ASSEMBLED", "BOLTS", "SQUARE WASHERS"].includes(classified.cat ?? "")
      ? partCodeSize(block, classified.cat === "SQUARE WASHERS")
      : null;

    if (partSize) {
      const fromPart = parseSize(partSize, classified.cat);
      const agrees =
        fromPart.diamValue === size.diamValue &&
        fromPart.lengthValue === size.lengthValue &&
        fromPart.sizeOverride === size.sizeOverride;

      if (!printedSize || (!agrees && ocrPages.has(anchor.page))) {
        review.push(
          printedSize
            ? `Size line read as "${printedSize}", taken from the Buyer Part code instead`
            : "Size line unreadable, taken from the Buyer Part code"
        );
        rawSize = partSize;
        classified = classify(description, printedSize || partSize);
        size = fromPart;
      }
    }

    const po = readPo(block);
    if (!po) review.push("No buyer order number found");

    const line: ParsedLine = {
      pallet: caseNumbers[index].pallet,
      cat: classified.cat,
      item: classified.item,
      diamValue: size.diamValue,
      lengthValue: size.lengthValue,
      diamDisplay: size.diamDisplay,
      lengthDisplay: size.lengthDisplay,
      sizeOverride: size.sizeOverride,
      qty: quantity.qty,
      po,
      description,
      rawSize,
      review: [...review, ...classified.review, ...size.review]
    };

    return { line, choice: quantity };
  });

  const settled = lines.map(({ line, choice }) => ({
    pallet: line.pallet,
    product: [line.cat, line.item, line.diamValue, line.lengthValue, line.sizeOverride].join("|"),
    choice
  }));

  return lines.map(({ line }, index) => {
    const { qty, review } = settleQty(
      settled[index].choice,
      settled[index].product,
      settled.filter((_, other) => other !== index)
    );

    return { ...line, qty, review: [...review, ...line.review] };
  });
};

export const gdpa: SupplierRules = {
  id: "GDPA",
  label: "GDPA",
  ready: true,
  notes: [
    "One row per line item, anchored on the W. Case No. column at the far left.",
    "Quantity is the TOTAL QTY. column, cross-checked against Tot Pkgs x Qty per ctn, (Box To - Box From + 1) x Qty per ctn and the subtotal printed under the line; figures are placed in their columns by position, measured from the two PCS header words.",
    "When a line's own figures don't agree (usually OCR), it borrows the quantity of a confirmed line for the same item in the same number of cartons, and is flagged.",
    "Case numbers run 1 up to the '1-34 wooden cases' count; a case number OCR has garbled or dropped a digit from is put back in sequence and flagged. Part-cases topping up an earlier case (Box From past 1) follow and keep their printed number.",
    "On a scanned page the size is cross-checked against the Buyer Part code (931G20X500, 933CEASS16X040, SQWG50X50X05X21) and taken from the code when the size line is missing or disagrees, flagged.",
    "HEX BOLT becomes BOLTS / BOLT, HEX SCREW becomes ASSEMBLED / ASS, SQ PLATE WASHER becomes SQUARE WASHERS, THREADED STUD becomes OTHER / STUD, U-BOLT becomes U/J/C BOLTS / U BOLT, SQ.SQ. BOLT (or SQUARE BOLT) becomes HOLDING DOWN BOLTS / HDB.",
    "The finish suffix comes from the description: HOT DIP GALV is HDG, ELECTRO ZINC PLATED is ZP, SELF COLOUR is SC.",
    "Sizes read as M.22 X 300, ignoring any [THREAD - 150MM] note.",
    "Square washers read as either 40 X 40 X 10MM - [ROUND HOLE 13] or 50MM X 50MM X 3MM THK [ROUND HOLE = 21MM]: the size column becomes plate² X thickness X hole, diam_value is the hole size itself (not converted to a bolt size), and length_value is the plate width.",
    "U-bolts only carry two numbers on the packing list (diameter and length) - the reach and (S)/(L) tag on a finished label come from a pipe-diameter reference table, not the PDF, so they're left for manual entry and the row is flagged.",
    "PO is taken from Buyer Order No:PO000003425 (or No:PO 3669) with the prefix and leading zeros stripped.",
    "Scanned (non-digital) packing lists are read by OCR, which reports one box per word instead of per line and can land a few points off a row's true position - both are allowed for, but OCR pages are still worth checking closely."
  ],
  parse
};
