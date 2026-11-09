import type { ParsedLine, PdfPageText, PdfWord, SupplierRules } from "../types";

/*
  NINGBO JINDING FASTENING PIECE CO.,LTD packing list
  ---------------------------------------------------
  Sent as a scan, one row per line item. Page 1 is landscape; later pages are
  scanned sideways and come upright through extract's orientation check, with
  the columns at the same positions:

    x ~55    Contract No.   26JDG274S
    x ~117   Order No.      PO000004944
    x ~185   Description    Threaded Rod 8.8 / DIN125-1A HV140 / DIN9021 HV100
    x ~270   Coating        BZP Cr3+ 5um / HDG 50um
    x ~340   SIZE           16X2X1000 (diam X pitch X mm), M16, M8(d2=25,h=1.5)
    x ~410   QTY            0.600 - thousands of pieces
    x ~450   PCS/BOX, x ~488 BOX/CTN, x ~522 CTNS
    x ~557   PALLETS        1, 2 ... a mixed pallet repeats its number
    x ~597   Item No        975HT16X1Z, 125Z16, 9021Z08X025X1.5

  The Item No says what the line is (975HT = threaded bar, 125 = flat washer,
  9021 = mudwasher), its size and its finish (last letter Z = zinc, G = HDG),
  so it's the main source and the SIZE, Description and Coating columns back
  it up. The scan is slightly crooked and OCR puts a row's cells a few points
  above or below each other, so cells are matched to rows in order down each
  column rather than by height alone. Every page is read several times (see
  `ocr` below) and each field is what the readings agree on:
   - the quantity is also PCS/BOX x BOX/CTN x CTNS, and the column total is
     printed under the table - one unsure quantity is worked out from it;
   - pallet numbers run on by one, or repeat for a mixed pallet, and the
     footer gives the number of pallets;
   - the PO is matched against the Order No list in the page header.
*/

const CONTRACT_X: [number, number] = [45, 108];
const ORDER_X: [number, number] = [108, 175];
const DESC_X: [number, number] = [175, 262];
const COAT_X: [number, number] = [262, 332];
const SIZE_X: [number, number] = [332, 400];
const QTY_X: [number, number] = [400, 440];
const PCS_X: [number, number] = [440, 472];
const BOX_X: [number, number] = [472, 508];
const CTNS_X: [number, number] = [508, 545];
const PALLET_X: [number, number] = [545, 582];
const ITEM_X: [number, number] = [582, 655];

/** Words this close in height are one printed line within a column. */
const LINE_Y = 3;

/** A cell left over after matching a column costs this much - more than a row's height. */
const SKIP_COST = 14;

/** More unsure quantities than this are flagged rather than worked out from the total. */
const MAX_QTY_COMBINATIONS = 50_000;

/** A split Item No ("975HT" / "10X3Z") is joined across this much height. */
const FRAGMENT_Y = 9;

const inX = (word: PdfWord, [min, max]: [number, number]) => word.x >= min && word.x < max;

/** Letters OCR swaps for digits inside a number. */
const DIGIT_LOOKALIKES: Record<string, string> = {
  O: "0", Q: "0", D: "0", C: "0", I: "1", L: "1", "|": "1", "!": "1", S: "5", B: "8"
};

const digits = (text: string) =>
  [...text.toUpperCase()].map((ch) => DIGIT_LOOKALIKES[ch] ?? ch).join("");

/** Standard metric diameters - anything else is a misread. */
const DIAMETERS = new Set([5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 27, 30, 33, 36]);

type Kind = "bar" | "flat" | "mud";
type Finish = "ZP" | "HDG";

type Cell = { y: number; text: string };

type RowRead = {
  kind: Kind[];
  diam: number[];
  length: number[];
  finish: Finish[];
  outer: number[];
  thickness: number[];
  qty: number[];
  cartonQty: number[];
  pallet: number[];
  po: string[];
};

const emptyRead = (): RowRead => ({
  kind: [],
  diam: [],
  length: [],
  finish: [],
  outer: [],
  thickness: [],
  qty: [],
  cartonQty: [],
  pallet: [],
  po: []
});

/** Joins a column's words that sit on one line, left to right. */
const columnCells = (words: PdfWord[], range: [number, number]): Cell[] => {
  const lines: PdfWord[][] = [];

  for (const word of words.filter((w) => inX(w, range)).sort((a, b) => b.y - a.y)) {
    const line = lines.find((group) => Math.abs(group[0].y - word.y) <= LINE_Y);
    if (line) line.push(word);
    else lines.push([word]);
  }

  return lines.map((line) => ({
    y: line.reduce((sum, word) => sum + word.y, 0) / line.length,
    text: line
      .sort((a, b) => a.x - b.x)
      .map((word) => word.text)
      .join("")
  }));
};

/** "975HT" read on its own joins the rest of its code from just above or below. */
const joinItemFragments = (cells: Cell[]): Cell[] => {
  const used = new Set<Cell>();
  const out: Cell[] = [];

  for (const cell of cells) {
    if (used.has(cell)) continue;

    if (/^\W*9?75HT\W*$/i.test(cell.text)) {
      const rest = cells
        .filter((other) => other !== cell && !used.has(other) && !/75HT/i.test(other.text))
        .filter((other) => Math.abs(other.y - cell.y) <= FRAGMENT_Y)
        .sort((a, b) => Math.abs(a.y - cell.y) - Math.abs(b.y - cell.y))[0];

      if (rest) {
        used.add(rest);
        out.push({ y: cell.y, text: `975HT${rest.text}` });
        continue;
      }
    }

    out.push(cell);
  }

  return out.sort((a, b) => b.y - a.y);
};

/**
 * Matches a column's cells to the rows in order, top to bottom. A column sits
 * a little above or below the rows' own line, so its usual offset is taken
 * off first; then each cell goes to a row (in order, at most one per row) or
 * is left over, whichever fits the heights best.
 */
const align = (cells: Cell[], rows: number[]): (Cell | null)[] => {
  const result: (Cell | null)[] = rows.map(() => null);
  if (!cells.length || !rows.length) return result;

  const residuals = cells
    .map((cell) => {
      const nearest = rows.reduce((best, row) =>
        Math.abs(row - cell.y) < Math.abs(best - cell.y) ? row : best
      );
      return cell.y - nearest;
    })
    .sort((a, b) => a - b);
  const offset = residuals[Math.floor(residuals.length / 2)];

  const m = cells.length;
  const n = rows.length;
  const cost: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(Infinity));
  const step: string[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(""));
  cost[0][0] = 0;

  for (let i = 0; i <= m; i += 1) {
    for (let j = 0; j <= n; j += 1) {
      if (i === 0 && j === 0) continue;
      if (j > 0 && cost[i][j - 1] < cost[i][j]) {
        cost[i][j] = cost[i][j - 1];
        step[i][j] = "row";
      }
      if (i > 0 && cost[i - 1][j] + SKIP_COST < cost[i][j]) {
        cost[i][j] = cost[i - 1][j] + SKIP_COST;
        step[i][j] = "cell";
      }
      if (i > 0 && j > 0) {
        const fit = cost[i - 1][j - 1] + Math.abs(cells[i - 1].y - offset - rows[j - 1]);
        if (fit < cost[i][j]) {
          cost[i][j] = fit;
          step[i][j] = "match";
        }
      }
    }
  }

  for (let i = m, j = n; i > 0 || j > 0; ) {
    const how = step[i][j];
    if (how === "match") {
      result[j - 1] = cells[i - 1];
      i -= 1;
      j -= 1;
    } else if (how === "row") {
      j -= 1;
    } else {
      i -= 1;
    }
  }

  return result;
};

type ItemCode = {
  kind: Kind;
  diam: number;
  length?: number;
  outer?: number;
  thickness?: number;
  finish: Finish | null;
};

const finishLetter = (letter: string): Finish | null =>
  /[Z2]/.test(letter) ? "ZP" : /[G6]/.test(letter) ? "HDG" : null;

/** 975HT16X1Z, 125Z16, 9021Z08X025X1.5 - with OCR's usual slips (Z read as 2, 9 as 8). */
const readItemCode = (raw: string): ItemCode | null => {
  const text = raw.toUpperCase().replace(/[^A-Z0-9.]/g, "");

  const bar = text.match(/9?75HT([0-9A-Z]{2})X([0-9A-Z])([A-Z0-9])$/);
  if (bar) {
    const diam = Number(digits(bar[1]));
    const length = Number(digits(bar[2]));
    if (DIAMETERS.has(diam) && length >= 1 && length <= 6) {
      return { kind: "bar", diam, length, finish: finishLetter(bar[3]) };
    }
  }

  const mud = text.match(/[89]O?21([A-Z0-9])([0-9A-Z]{2})X([0-9A-Z]{3})X([0-9A-Z.]{1,4})$/);
  if (mud) {
    const diam = Number(digits(mud[2]));
    const outer = Number(digits(mud[3]));
    const thickness = Number(digits(mud[4]));
    if (DIAMETERS.has(diam) && outer > diam && thickness > 0 && thickness < 10) {
      return { kind: "mud", diam, outer, thickness, finish: finishLetter(mud[1]) };
    }
  }

  const flat = text.match(/^125([A-Z0-9])([0-9A-Z]{2})$/);
  if (flat) {
    const diam = Number(digits(flat[2]));
    if (DIAMETERS.has(diam)) return { kind: "flat", diam, finish: finishLetter(flat[1]) };
  }

  return null;
};

/** Reads one row's cells from one OCR pass into `read`. */
const readCells = (cells: Record<string, Cell | null>, read: RowRead) => {
  const text = (key: string) => cells[key]?.text ?? "";

  const code = readItemCode(text("item"));
  if (code) {
    read.kind.push(code.kind);
    read.diam.push(code.diam);
    if (code.length) read.length.push(code.length);
    if (code.outer) read.outer.push(code.outer);
    if (code.thickness) read.thickness.push(code.thickness);
    if (code.finish) read.finish.push(code.finish);
  }

  const desc = text("desc").toUpperCase();
  if (/THREAD|ROD/.test(desc)) read.kind.push("bar");
  else if (/125/.test(desc)) read.kind.push("flat");
  else if (/[9S8]0?21|HV100/.test(desc)) read.kind.push("mud");

  const coat = text("coat").toUpperCase();
  if (/HDG|50/.test(coat)) read.finish.push("HDG");
  else if (/B.?ZP|CR3/.test(coat)) read.finish.push("ZP");

  const size = text("size").toUpperCase().replace(/\s/g, "");
  const barSize = size.match(/^([0-9A-Z]{2})X[0-9A-Z.]+X([0-9A-Z]{4})$/);
  const mudSize = size.match(/^M([0-9A-Z]{1,2})\(?D2=([0-9A-Z]{2}).*H=([0-9A-Z.]{1,4})/);
  const flatSize = size.match(/^M([0-9A-Z]{1,2})$/);

  if (barSize) {
    const diam = Number(digits(barSize[1]));
    const mm = Number(digits(barSize[2]));
    if (DIAMETERS.has(diam)) read.diam.push(diam);
    if (mm % 1000 === 0 && mm > 0) read.length.push(mm / 1000);
    read.kind.push("bar");
  } else if (mudSize) {
    const diam = Number(digits(mudSize[1]));
    if (DIAMETERS.has(diam)) read.diam.push(diam);
    const outer = Number(digits(mudSize[2]));
    const thickness = Number(digits(mudSize[3]).replace(/\)$/, ""));
    if (outer) read.outer.push(outer);
    if (thickness > 0 && thickness < 10) read.thickness.push(thickness);
    read.kind.push("mud");
  } else if (flatSize) {
    const diam = Number(digits(flatSize[1]));
    // "M16" reads more reliably than the code's 125Z16, where the Z and 2
    // run into the diameter, so it counts twice.
    if (DIAMETERS.has(diam)) read.diam.push(diam, diam);
    read.kind.push("flat");
  }

  const qty = digits(text("qty")).match(/^(\d{1,3})[.,](\d{3})$/);
  if (qty) read.qty.push(Number(qty[1]) * 1000 + Number(qty[2]));

  const count = (key: string) => {
    const value = digits(text(key)).replace(/,/g, "");
    return /^\d+$/.test(value) ? Number(value) : null;
  };
  const pcs = count("pcs");
  const box = count("box");
  const ctns = count("ctns");
  if (pcs && box && ctns) read.cartonQty.push(pcs * box * ctns);

  const pallet = count("pallet");
  if (pallet && pallet < 1000) read.pallet.push(pallet);

  const po = digits(text("order").replace(/^P[^0-9A-Z]?[O0Q]?/i, "")).replace(/\D/g, "");
  if (po.length >= 4) read.po.push(po.slice(-4));
};

type Tally<T> = { value: T | null; count: number; total: number; others: T[] };

const tally = <T>(values: T[]): Tally<T> => {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    value: ranked[0]?.[0] ?? null,
    count: ranked[0]?.[1] ?? 0,
    total: values.length,
    others: ranked.slice(1).map(([value]) => value)
  };
};

/** A field is sure when no reading disagrees, or nearly all of them agree. */
const sure = <T>(result: Tally<T>) =>
  result.value !== null && (result.others.length === 0 || result.count >= result.total * 0.75);

type PassTable = {
  rows: RowRead[];
  /** QTY column total under the table, in pieces. */
  total: number | null;
  /** "Total Number of Pallets: 28". */
  pallets: number | null;
  /** Order numbers listed in the page header, last four digits. */
  headerPos: string[];
};

const readPass = (pageWords: PdfWord[][]): PassTable => {
  const table: PassTable = { rows: [], total: null, pallets: null, headerPos: [] };

  for (const pageText of pageWords) {
    // OCR word boxes vary in height but their tops line up along a row, so
    // positions here are each word's top edge.
    const words = pageText.map((w) => ({ ...w, y: w.y + (w.height ?? 0) }));
    const header = words.find((w) => inX(w, PALLET_X) && /PALLET/i.test(w.text));
    const totalWord = words.find((w) => w.x < 175 && /^TOTAL/i.test(w.text));
    const top = header ? header.y - 4 : Infinity;
    const bottom = totalWord ? totalWord.y + 4 : -Infinity;
    const body = words.filter((w) => w.y < top && w.y > bottom);

    // Rows are wherever the Contract No. or Order No. column has something
    // that looks like one; both sit on the row's own line.
    const anchorYs = body
      .filter(
        (w) =>
          (inX(w, CONTRACT_X) && /J.?[D0O].?G|^\d{2}[J4]/i.test(w.text)) ||
          (inX(w, ORDER_X) && /^P.?[O0QD]/i.test(w.text) && w.text.length >= 8)
      )
      .map((w) => w.y)
      .sort((a, b) => b - a);
    const rows: number[] = [];
    for (const y of anchorYs) {
      if (rows.length && Math.abs(rows[rows.length - 1] - y) <= 4) continue;
      rows.push(y);
    }

    const columns: Record<string, (Cell | null)[]> = {
      order: align(columnCells(body, ORDER_X), rows),
      desc: align(columnCells(body, DESC_X), rows),
      coat: align(columnCells(body, COAT_X), rows),
      size: align(columnCells(body, SIZE_X), rows),
      qty: align(columnCells(body, QTY_X), rows),
      pcs: align(columnCells(body, PCS_X), rows),
      box: align(columnCells(body, BOX_X), rows),
      ctns: align(columnCells(body, CTNS_X), rows),
      pallet: align(columnCells(body, PALLET_X), rows),
      item: align(joinItemFragments(columnCells(body, ITEM_X)), rows)
    };

    rows.forEach((_, index) => {
      const read = emptyRead();
      readCells(
        Object.fromEntries(Object.entries(columns).map(([key, cells]) => [key, cells[index]])),
        read
      );
      table.rows.push(read);
    });

    if (totalWord) {
      const sum = words.find(
        (w) => Math.abs(w.y - totalWord.y) <= 4 && inX(w, [380, 460]) && /^\d{1,4}[.,]\d{3}$/.test(digits(w.text))
      );
      if (sum) table.total = Math.round(Number(digits(sum.text).replace(",", ".")) * 1000);
    }

    for (const word of words.filter((w) => /^PALLETS?$/i.test(w.text) && w.y < top - 20)) {
      const number = words.find(
        (w) => Math.abs(w.y - word.y) <= 4 && word.x - w.x > 0 && word.x - w.x < 30 && /^\d{1,3}$/.test(digits(w.text))
      );
      if (number) table.pallets = Number(digits(number.text));
    }

    // "PO000004944,PO00000494" / "5,PO000004995" beside "Order No:".
    const orderLabel = words.find((w) => w.x > 600 && /^Order$/i.test(w.text));
    if (orderLabel) {
      const listed = words
        .filter((w) => w.x > orderLabel.x + 40 && w.y <= orderLabel.y + 4 && w.y >= orderLabel.y - 14)
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .map((w) => w.text)
        .join("");
      for (const match of listed.toUpperCase().matchAll(/P[O0]([0-9OQDS]{9})/g)) {
        table.headerPos.push(digits(match[1]).slice(-4));
      }
    }
  }

  return table;
};

/** How many characters two equal-length strings differ by. */
const distance = (a: string, b: string) =>
  [...a].reduce((sum, ch, i) => sum + (ch === b[i] ? 0 : 1), Math.abs(a.length - b.length));

/**
 * Picks pallet numbers that run on by one from row to row, or stay the same
 * for a mixed pallet, agreeing with as many readings as possible. Staying on
 * the same number has to be backed by a reading.
 */
const palletRun = (votes: number[][]): number[] => {
  if (!votes.length) return [];

  const starts = new Set<number>([1]);
  votes.forEach((rowVotes, index) => rowVotes.forEach((v) => v - index >= 1 && starts.add(v - index)));

  let best: { score: number; run: number[] } | null = null;

  for (const start of starts) {
    // score[k] = best score with row i on start + k (k = steps taken so far)
    let states = new Map<number, { score: number; run: number[] }>();
    const first = votes[0].filter((v) => v === start).length;
    states.set(start, { score: first, run: [start] });

    for (let i = 1; i < votes.length; i += 1) {
      const next = new Map<number, { score: number; run: number[] }>();
      for (const [value, state] of states) {
        for (const candidate of [value, value + 1]) {
          const support = votes[i].filter((v) => v === candidate).length;
          const score = state.score + support - (candidate === value ? 0.5 : 0);
          const existing = next.get(candidate);
          if (!existing || existing.score < score) {
            next.set(candidate, { score, run: [...state.run, candidate] });
          }
        }
      }
      states = next;
    }

    for (const state of states.values()) {
      if (!best || state.score > best.score) best = state;
    }
  }

  return best?.run ?? votes.map((_, index) => index + 1);
};

const parse = (pages: PdfPageText[]): ParsedLine[] => {
  const passCount = Math.max(1, ...pages.map((page) => page.passes?.length ?? 1));
  const passes = Array.from({ length: passCount }, (_, index) =>
    readPass(pages.map((page) => (page.passes ?? [page.words])[index] ?? page.words))
  );

  // The row count is what most readings found; a reading that missed or
  // doubled a row is left out rather than shifting every row after it.
  const rowCount = tally(passes.map((pass) => pass.rows.length)).value ?? 0;
  const usable = passes.filter((pass) => pass.rows.length === rowCount);

  const reads = Array.from({ length: rowCount }, (_, index) => {
    const merged = emptyRead();
    for (const pass of usable) {
      const row = pass.rows[index];
      (Object.keys(merged) as (keyof RowRead)[]).forEach((key) =>
        (merged[key] as unknown[]).push(...(row[key] as unknown[]))
      );
    }
    return merged;
  });

  // Order numbers are matched to the header's Order No list, plus any order
  // number the column reads cleanly on more than one row, in case a reading
  // missed part of the header.
  const rowsReading = new Map<string, number>();
  for (const read of reads) {
    for (const po of new Set(read.po)) rowsReading.set(po, (rowsReading.get(po) ?? 0) + 1);
  }
  const knownPos = [
    ...new Set([
      ...passes.flatMap((pass) => pass.headerPos),
      ...[...rowsReading.entries()].filter(([, rows]) => rows > 1).map(([po]) => po)
    ])
  ];
  const total = tally(passes.map((pass) => pass.total).filter((v): v is number => v !== null));
  const declaredPallets = tally(passes.map((pass) => pass.pallets).filter((v): v is number => v !== null));
  const pallets = palletRun(reads.map((read) => read.pallet));

  const lines = reads.map((read, index): ParsedLine & { qtySure: boolean; qtyCandidates: number[] } => {
    const review: string[] = [];
    const kind = tally(read.kind);
    const diam = tally(read.diam);
    const finish = tally(read.finish);
    const qty = tally(read.qty);
    const cartonQty = tally(read.cartonQty);
    const pallet = String(pallets[index]);

    if (!sure(kind)) review.push("Not sure what this line is - check the Item No and Description");
    if (!sure(diam)) review.push(`Diameter read as ${[diam.value, ...diam.others].filter(Boolean).join(" or ") || "nothing"}`);
    if (!sure(finish)) review.push("Finish not clear - check the Coating column");

    let po = tally(read.po).value ?? "";
    if (knownPos.length && read.po.length) {
      const ranked = knownPos
        .map((candidate) => ({
          candidate,
          misses: read.po.reduce((sum, value) => sum + distance(value, candidate), 0)
        }))
        // On a tie, the order number more rows read.
        .sort(
          (a, b) =>
            a.misses - b.misses ||
            (rowsReading.get(b.candidate) ?? 0) - (rowsReading.get(a.candidate) ?? 0)
        );
      po = ranked[0].candidate;
      if (
        ranked[1] &&
        ranked[1].misses === ranked[0].misses &&
        rowsReading.get(ranked[1].candidate) === rowsReading.get(ranked[0].candidate)
      ) {
        review.push(`Order number read as ${read.po.join(" / ")}`);
      }
    }
    if (!po) review.push("No order number found");
    po = po.replace(/^0+/, "");

    // Sure when the readings agree and PCS/BOX x BOX/CTN x CTNS doesn't say
    // otherwise; anything else is settled against the column total below.
    const qtyValue = qty.value ?? cartonQty.value;
    const qtySure =
      qty.value !== null && sure(qty) && (cartonQty.value === null || read.cartonQty.includes(qty.value));
    const qtyCandidates = [...new Set([...read.qty, ...read.cartonQty])];

    const d = diam.value;
    const finishName = finish.value ?? "ZP";
    const letter = finishName === "HDG" ? "G" : "Z";
    const base = {
      pallet,
      qty: qtyValue,
      po,
      description: "",
      review,
      qtySure,
      qtyCandidates
    };

    if (kind.value === "bar") {
      const length = tally(read.length);
      if (!sure(length)) review.push(`Length read as ${[length.value, ...length.others].filter(Boolean).join(" or ") || "nothing"} m`);
      const l = length.value;
      return {
        ...base,
        cat: "THREADED BAR",
        item: `T BAR ${finishName}`,
        code: d && l ? `975HT${d}X${l}${letter}` : null,
        diamValue: d,
        lengthValue: l,
        diamDisplay: d ? String(d) : "",
        lengthDisplay: l ? `${l}M` : "",
        sizeOverride: null,
        rawSize: d && l ? `${d}X${l * 1000}` : ""
      };
    }

    if (kind.value === "mud") {
      const outer = tally(read.outer);
      const thickness = tally(read.thickness);
      if (!sure(outer) || !sure(thickness)) review.push("Mudwasher outside diameter or thickness not clear");
      const o = outer.value;
      const t = thickness.value;
      // Outside diameter and thickness run together, eg 25 and 1.5 -> 25.15.
      const lengthValue = o && t ? Number(`${o}.${String(t).replace(".", "")}`) : null;
      return {
        ...base,
        cat: "OTHER WASHERS",
        item: `MUDWASHER ${finishName}`,
        code: d && o && t ? `9021${letter}${String(d).padStart(2, "0")}X${String(o).padStart(3, "0")}X${t}` : null,
        diamValue: d,
        lengthValue,
        diamDisplay: d ? String(d) : "",
        lengthDisplay: o && t ? `${o} X ${t}` : "",
        sizeOverride: null,
        rawSize: d && o && t ? `M${d}(d2=${o},h=${t})` : ""
      };
    }

    return {
      ...base,
      cat: kind.value === "flat" ? "FLAT WASHERS" : null,
      item: kind.value === "flat" ? `FLAT WASHER ${finishName}` : null,
      code: kind.value === "flat" && d ? `125${letter}${d}` : null,
      diamValue: d,
      lengthValue: 0,
      diamDisplay: d ? String(d) : "",
      lengthDisplay: "0",
      sizeOverride: d ? `M${d}` : null,
      rawSize: d ? `M${d}` : ""
    };
  });

  // Unsure quantities are settled against the column total: of every
  // combination of the values read for them, the one that makes the total
  // up is used, as long as only one does.
  const unsure = lines.filter((line) => !line.qtySure);
  if (total.value !== null && unsure.length) {
    const known = lines.filter((line) => line.qtySure).reduce((sum, line) => sum + (line.qty ?? 0), 0);
    const options = unsure.map((line) => (line.qtyCandidates.length ? line.qtyCandidates : [line.qty ?? 0]));
    const combinations = options.reduce((count, values) => count * values.length, 1);
    const fits: number[][] = [];

    if (combinations <= MAX_QTY_COMBINATIONS) {
      const pick = (index: number, chosen: number[], sum: number) => {
        if (index === options.length) {
          if (known + sum === total.value) fits.push(chosen);
          return;
        }
        for (const value of options[index]) pick(index + 1, [...chosen, value], sum + value);
      };
      pick(0, [], 0);
    }

    if (fits.length === 1) {
      unsure.forEach((line, index) => {
        if (fits[0][index] !== line.qty) {
          line.review.push(`Qty read as ${line.qty ?? "nothing"}, ${fits[0][index]} makes the packing list total add up`);
        }
        line.qty = fits[0][index];
        line.qtySure = true;
      });
    }
  }
  for (const line of lines) {
    if (!line.qtySure) line.review.push(`Qty not clear (read as ${line.qtyCandidates.join(" or ") || "nothing"})`);
  }

  const distinctPallets = new Set(lines.map((line) => line.pallet)).size;
  if (declaredPallets.value !== null && declaredPallets.value !== distinctPallets && lines.length) {
    lines[lines.length - 1].review.push(
      `Packing list says ${declaredPallets.value} pallets but ${distinctPallets} were found - check the pallet numbers`
    );
  }

  if (passCount > usable.length) {
    const note = `${passCount - usable.length} of ${passCount} OCR readings found a different number of rows and were left out`;
    if (lines.length) lines[0].review.push(note);
  }

  return lines;
};

export const ningboJinding: SupplierRules = {
  id: "NINGBO_JINDING",
  label: "NINGBO JINDING",
  ready: true,
  notes: [
    "Read by OCR (this supplier sends scans). Pages scanned sideways are turned upright first.",
    "The Item No column says what each line is: 975HT16X1Z is threaded bar 16 x 1M, 125Z16 is an M16 flat washer, 9021Z08X025X1.5 is an M8 mudwasher 25 x 1.5. The last letter is the finish (Z = ZP, G = HDG). The SIZE, Description and Coating columns are cross-checked against it.",
    "Threaded Rod becomes THREADED BAR / T BAR ZP or T BAR HDG, sized diameter X metres (16X2X1000 becomes 16 X 1M - the middle pitch figure is dropped).",
    "DIN125 becomes FLAT WASHERS / FLAT WASHER ZP, sized M16 (length 0). DIN9021 becomes OTHER WASHERS / MUDWASHER ZP, sized 8 X 25 X 1.5 with length_value 25.15.",
    "QTY is printed in thousands (0.600 = 600 pcs). It's checked against PCS/BOX x BOX/CTN x CTNS and the printed total.",
    "PO is the last digits of the Order No, eg PO000004944 becomes 4944. The code column carries the supplier's Item No.",
    "A pallet number printed on two rows with different products is a mixed pallet, eg 18 (MIX-2)."
  ],
  ocr: [
    { scale: 3, threshold: 0 },
    { scale: 4, threshold: 0 },
    { scale: 4, threshold: 170 }
  ],
  parse
};
