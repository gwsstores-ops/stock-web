import { emptyTrackingRow, type TrackingRow } from "./tracking";

/**
 * Reads the container tracking table out of a screenshot (eg a tracking
 * site's "last known position" list) by OCR, then reconstructs rows and
 * columns from the word positions tesseract.js gives back.
 *
 * This is read as a best guess only - the admin page shows every field in an
 * editable table afterwards, so a misread word here just means a cell worth
 * double-checking, not a failure.
 */

type TesseractWorker = Awaited<
  ReturnType<typeof import("tesseract.js")["createWorker"]>
>;

type OcrWord = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

type OcrBlock = {
  paragraphs: {
    lines: {
      words: OcrWord[];
    }[];
  }[];
};

export type TrackingWord = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export const readTrackingWords = async (file: File): Promise<TrackingWord[]> => {
  const { createWorker } = await import("tesseract.js");
  const worker: TesseractWorker = await createWorker("eng");

  try {
    const result = await worker.recognize(file, {}, { blocks: true });
    const blocks = ((result.data as unknown as { blocks?: OcrBlock[] | null })
      .blocks ?? []) as OcrBlock[];

    const words = blocks.flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.flatMap((line) => line.words)
      )
    );

    return words
      .filter((word) => /[a-z0-9]/i.test(word.text))
      .map((word) => ({
        text: word.text,
        x0: word.bbox.x0,
        y0: word.bbox.y0,
        x1: word.bbox.x1,
        y1: word.bbox.y1
      }));
  } finally {
    await worker.terminate();
  }
};

const CONTAINER_RE = /\b([A-Z]{4}\d{6,7})\b/;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

/** Collapses OCR word-spacing artefacts like "Mundra , India" -> "Mundra, India". */
const tidy = (text: string) =>
  text
    .replace(/\s+([,.])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Groups words into lines by their vertical centre, not their raw top/bottom
 * edge - tesseract occasionally hands back a short word (eg "on", "by") with
 * a bounding box stretched well past its actual line in one or both
 * directions, which would otherwise bridge two real lines into one.
 */
const clusterByY = <T extends { y0: number; y1: number }>(
  items: T[],
  gap: number
): T[][] => {
  const sorted = [...items].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const clusters: T[][] = [];
  let lastCentre: number | null = null;

  for (const item of sorted) {
    const centre = (item.y0 + item.y1) / 2;

    if (lastCentre !== null && centre - lastCentre <= gap) {
      clusters[clusters.length - 1].push(item);
    } else {
      clusters.push([item]);
    }

    lastCentre = centre;
  }

  return clusters;
};

const joinWords = (words: TrackingWord[]) =>
  tidy(
    [...words]
      .sort((a, b) => a.x0 - b.x0)
      .map((w) => w.text)
      .join(" ")
  );

/**
 * Pulls the one date out of a cell's text lines, keeping any text that sat
 * alongside it on the same line (two lines can end up merged into one by
 * `clusterByY` when a word's bounding box is a little off).
 */
const splitDate = (lines: string[]): { rest: string[]; date: string } => {
  let date = "";
  const rest: string[] = [];

  for (const line of lines) {
    const match = line.match(DATE_RE);

    if (match && !date) {
      date = match[1];
      const remainder = tidy(line.replace(DATE_RE, ""));
      if (remainder) rest.push(remainder);
    } else {
      rest.push(line);
    }
  }

  return { rest, date };
};

const medianLineHeight = (words: TrackingWord[]): number => {
  const heights = words.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  if (!heights.length) return 14;
  return heights[Math.floor(heights.length / 2)];
};

export const parseTrackingRows = (words: TrackingWord[]): TrackingRow[] => {
  if (!words.length) return [];

  const lineHeight = medianLineHeight(words);
  const rowGap = lineHeight * 1.8;
  const subLineGap = lineHeight * 0.6;

  // Row anchors: the container code is the one thing guaranteed to appear
  // once, at the start of every data row (regardless of column - the
  // boundaries below are not known yet).
  const anchors = words
    .filter((w) => CONTAINER_RE.test(w.text.toUpperCase()))
    .sort((a, b) => a.y0 - b.y0);

  if (!anchors.length) return [];

  // Column boundaries: a table's 4 columns show up as 4 clusters of x0 values
  // with big gaps between them. Only the first line of each row is used to
  // find them - a lower line can carry a button or a second wrapped line
  // (eg "Container type: ..." plus a "more details" button) whose own x0
  // gaps are not real column breaks and would otherwise throw this off.
  const firstLineTolerance = lineHeight * 2;
  const firstLineWords = words.filter((w) =>
    anchors.some((a) => Math.abs(w.y0 - a.y0) <= firstLineTolerance)
  );

  const minX = Math.min(...words.map((w) => w.x0));
  const maxX = Math.max(...words.map((w) => w.x1));
  const span = (maxX - minX) / 4;
  let boundaries = [minX + span, minX + span * 2, minX + span * 3];

  const xs = Array.from(new Set(firstLineWords.map((w) => w.x0))).sort((a, b) => a - b);

  if (xs.length >= 4) {
    const gaps = xs
      .slice(1)
      .map((x, i) => ({ gap: x - xs[i], at: (x + xs[i]) / 2 }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 3)
      .sort((a, b) => a.at - b.at);

    if (gaps.length === 3) boundaries = gaps.map((g) => g.at);
  }

  // The gap midpoints above are a good split for the anchor's own line, but a
  // cell can carry something wider a line further down (eg a "more details"
  // button next to the container code) that the first line alone would not
  // account for. Each boundary is pulled in to sit just left of where the
  // NEXT column's first-line text actually starts, which still clears any
  // such width on the column to its left.
  const MARGIN = 20;
  const bucket = (x0: number) => boundaries.filter((b) => x0 >= b).length;
  const colMins = [Infinity, Infinity, Infinity, Infinity];
  for (const w of firstLineWords) {
    const col = bucket(w.x0);
    if (w.x0 < colMins[col]) colMins[col] = w.x0;
  }
  boundaries = boundaries.map((fallback, i) =>
    Number.isFinite(colMins[i + 1]) ? colMins[i + 1] - MARGIN : fallback
  );

  const [fromX, toX, lastX] = boundaries;

  const columnOf = (x0: number): 0 | 1 | 2 | 3 => {
    if (x0 < fromX) return 0;
    if (x0 < toX) return 1;
    if (x0 < lastX) return 2;
    return 3;
  };

  const maxY = Math.max(...words.map((w) => w.y1));
  const rows: TrackingRow[] = [];

  anchors.forEach((anchor, index) => {
    const top = anchor.y0 - subLineGap;
    const bottom = (anchors[index + 1]?.y0 ?? maxY + rowGap) - subLineGap;

    const rowWords = words.filter((w) => w.y0 >= top && w.y0 < bottom);
    const columns: TrackingWord[][] = [[], [], [], []];
    rowWords.forEach((w) => columns[columnOf(w.x0)].push(w));

    const lines = (col: TrackingWord[]) =>
      clusterByY(col, subLineGap).map((cluster) => joinWords(cluster));

    const col0 = lines(columns[0]);
    const col1 = lines(columns[1]);
    const col2 = lines(columns[2]);
    const col3 = lines(columns[3]);

    const containerMatch = col0.join(" ").toUpperCase().match(CONTAINER_RE);

    const from = splitDate(col1);
    const to = splitDate(col2);
    const last = splitDate(col3);

    const row: TrackingRow = {
      ...emptyTrackingRow(),
      container: containerMatch?.[1] ?? "",
      originPort: tidy(from.rest.join(" ")),
      originDate: from.date,
      destPort: tidy(to.rest.join(" ")) || "Cork, Ireland",
      eta: to.date,
      lastLocation: tidy(last.rest[0] ?? ""),
      lastStatus: tidy(last.rest.slice(1).join(" ")),
      lastStatusDate: last.date
    };

    if (row.container) rows.push(row);
  });

  return rows;
};
