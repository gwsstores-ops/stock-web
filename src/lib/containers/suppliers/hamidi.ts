import type { ParsedLine, PdfPageText, PdfWord, SupplierRules } from "../types";
import { finishSuffix } from "../rules";

/*
  HAMIDI EXPORTS packing list
  ---------------------------
  One page, sent as a scan. Every pallet ("Pkgs #", eg 816) is a block of one
  or two item rows - a full layer of bags plus a part bag - and the pallet's
  figures (Total No. Of Pallet, Total Qty, net and gross weights, finish) sit
  level with its LAST item row:

    x ~13-45    Pkgs #             816
    x ~45-100   Item               M12X40
    x ~95-137   Po No.             2578
    x ~137-192  Code               APM A40R
    x ~185-225  In Bags            30
    x ~225-265  In Pcs/Bag         350
    x ~305-350  Total Qty (pcs)    10672      <- the pallet's quantity
    x ~350-430  Net weights        690.000    <- anchors the pallet's block
    x ~505+     Finish             HDG

  The scan reads badly through OCR at the tool's usual settings, so these
  pages are OCR'd several times over, each pass thresholded to black and white
  at a different level (see `ocr` below), and every field is decided by what
  the passes agree on. Within a pass nothing is trusted on its own either:
   - pallets are found from the net weight figure ("690.000"), which reads
     far more reliably than the Pkgs # or the quantity, and checked against
     the "11 Pkgs." count in the description;
   - pallet numbers run on one from another, so every legible Pkgs # (and the
     "816-826" range under the marks) votes for where the run starts;
   - the quantity is the Total Qty figure, backed up by In Bags x In Pcs/Bag
     and by the column's printed grand total - one unreadable quantity is
     worked out from the grand total;
   - the size is read from the Item column, with the code's length (A40R ->
     40) as a tie-break.
*/

const PKG_X: [number, number] = [8, 45];
const ITEM_X: [number, number] = [40, 102];
const PO_X: [number, number] = [92, 137];
const CODE_X: [number, number] = [136, 192];
const BAGS_X: [number, number] = [185, 228];
const PCS_X: [number, number] = [228, 268];
const QTY_X: [number, number] = [305, 350];
const NET_X: [number, number] = [350, 432];
const FINISH_X: [number, number] = [505, 560];

/** Net weight readings closer than this are the same pallet's row. */
const ANCHOR_CLUSTER = 7;

/** A pallet's block starts this far below the previous pallet's figures. */
const BLOCK_LEAD = 5;

/** How far above its figures a pallet's first item row can sit. */
const FIRST_BLOCK_HEIGHT = 30;

const inX = (word: PdfWord, [min, max]: [number, number]) => word.x >= min && word.x < max;

/** OCR reads a table rule or bracket into a figure ("[30", "735.000]", "|e"). */
const stripRules = (text: string) => text.replace(/^[^\dA-Za-z]+|[^\dA-Za-z]+$/g, "");

const integer = (text: string): number | null => {
  const cleaned = stripRules(text).replace(/,/g, "");
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
};

const isWeight = (text: string) => /\d{2,4}[.,]\d{2,3}/.test(text) || /^\d{3,4}0{3}\]?$/.test(stripRules(text));

/** Letters OCR swaps for digits inside a size like M16X70. */
const DIGIT_LOOKALIKES: Record<string, string> = {
  I: "1", L: "1", "|": "1", "!": "1", O: "0", Q: "0", D: "0", S: "5", Z: "2", T: "7", B: "8", G: "6"
};

/** "MI6X40" -> [16, 40], "MZOXT0" -> [20, 70], "iM12%40" -> [12, 40]. */
const readSize = (text: string): [number, number] | null => {
  const upper = text.toUpperCase();
  const start = upper.indexOf("M");
  if (start < 0) return null;

  const match = upper.slice(start + 1).match(/^([^X%*]{1,3})[X%*]([^X%*]{2,3})/);
  if (!match) return null;

  const digits = (part: string) =>
    [...part].map((ch) => DIGIT_LOOKALIKES[ch] ?? ch).join("");
  const diam = digits(match[1]);
  const length = digits(match[2]);

  if (!/^\d{1,2}$/.test(diam) || !/^\d{2,3}$/.test(length)) return null;

  const d = Number(diam);
  const l = Number(length);

  return d >= 5 && d <= 36 && l >= 10 && l <= 500 ? [d, l] : null;
};

/** Standard metric diameters - anything else is a misread (M15, M10 for M16). */
const DIAMETERS = new Set([5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 27, 30, 33, 36]);

type Code = { letter: string; length: number | null };

/**
 * The code after "APM", eg "A40R" -> A / 40, "J5SF" -> J / 55, "KTOP" ->
 * K / 70. The letter stands for the diameter (A = M12, J = M16, K = M20 on
 * the sample), but that's learned from each list rather than fixed here.
 */
const readCode = (text: string): Code | null => {
  const upper = text.toUpperCase().replace(/^.*?APM/, "").replace(/^[^A-Z0-9]+/, "");
  const match = upper.match(/^([A-Z])([0-9A-Z]{2})/);
  if (!match) return null;

  const digits = [...match[2]].map((ch) => DIGIT_LOOKALIKES[ch] ?? ch).join("");
  return { letter: match[1], length: /^[1-9]\d$/.test(digits) ? Number(digits) : null };
};

type PassPallet = {
  index: number;
  pkgs: number | null;
  qty: number | null;
  bagsQty: number | null;
  sizes: [number, number][];
  codes: Code[];
  pos: string[];
  finish: string[];
};

type Pass = {
  pallets: PassPallet[];
  /** The pallet count printed as "11 Pkgs. containing ..." */
  declaredCount: number | null;
  /** The "816-826" marks range. */
  range: [number, number] | null;
  grandTotal: number | null;
  headerPo: string | null;
  description: string;
};

const clusterAnchors = (words: PdfWord[]): number[] => {
  const ys = words.map((word) => word.y).sort((a, b) => b - a);
  const clusters: number[][] = [];

  for (const y of ys) {
    const current = clusters[clusters.length - 1];
    if (current && current[0] - y <= ANCHOR_CLUSTER) current.push(y);
    else clusters.push([y]);
  }

  return clusters.map((cluster) => Math.min(...cluster));
};

const readPass = (rawWords: PdfWord[]): Pass => {
  const words = rawWords
    .map((word) => ({ ...word, text: word.text.trim() }))
    .filter((word) => word.text.length > 0);

  // The declaration under the table ("We hereby confirm that NO steel...")
  // closes it off; the grand totals print just under that.
  const footer = words.filter((word) => /hereby|confirm|Russian|Belarus/i.test(word.text));
  const footerY = footer.length ? Math.max(...footer.map((word) => word.y)) : -Infinity;

  // The column headers ("Item  Po No.  Code  In Bags  In Pcs/Bag") open it.
  const header = words.filter((word) => /Pcs\/Bag|^Bags$|ISO4017|HV100/i.test(word.text));
  const headerY = header.length ? Math.min(...header.map((word) => word.y)) : Infinity;

  const table = words.filter((word) => word.y > footerY + 3 && word.y < headerY + 2);

  const anchors = clusterAnchors(
    table.filter((word) => inX(word, NET_X) && isWeight(word.text))
  );

  const pallets: PassPallet[] = anchors.map((anchorY, index) => {
    const top = index === 0 ? anchorY + FIRST_BLOCK_HEIGHT : anchors[index - 1] - BLOCK_LEAD;
    const bottom = anchorY - BLOCK_LEAD;
    const block = table.filter((word) => word.y <= top && word.y > bottom);
    const column = (x: [number, number]) => block.filter((word) => inX(word, x));

    const pkgs = column(PKG_X)
      .map((word) => integer(word.text))
      .find((value): value is number => value !== null && value >= 100);

    const qtyWord = column(QTY_X)
      .filter((word) => {
        const value = integer(word.text);
        return value !== null && value >= 100;
      })
      .sort((a, b) => Math.abs(a.y - anchorY) - Math.abs(b.y - anchorY))[0];

    // In Bags x In Pcs/Bag, row by row. Only trusted when every row with a
    // bag count also has a readable pcs/bag beside it.
    const bagWords = column(BAGS_X).filter((word) => integer(word.text) !== null);
    const pcsWords = column(PCS_X).filter((word) => integer(word.text) !== null);
    let bagsQty: number | null = bagWords.length ? 0 : null;

    for (const bag of bagWords) {
      const pcs = pcsWords.find((word) => Math.abs(word.y - bag.y) <= 4);
      if (!pcs || bagsQty === null) {
        bagsQty = null;
        break;
      }
      bagsQty += integer(bag.text)! * integer(pcs.text)!;
    }

    if (bagWords.length !== pcsWords.length) bagsQty = null;

    return {
      index,
      pkgs: pkgs ?? null,
      qty: qtyWord ? integer(qtyWord.text) : null,
      bagsQty,
      sizes: column(ITEM_X)
        .map((word) => readSize(word.text))
        .filter((size): size is [number, number] => size !== null && DIAMETERS.has(size[0])),
      codes: column(CODE_X)
        .map((word) => readCode(word.text))
        .filter((code): code is Code => code !== null),
      pos: column(PO_X)
        .map((word) => stripRules(word.text))
        .filter((text) => /^\d{4}$/.test(text)),
      finish: column(FINISH_X).map((word) => word.text.toUpperCase())
    };
  });

  const countWord = words.findIndex((word) => /^Pkgs\.?$/i.test(word.text) && word.y > headerY);
  const declared = countWord > 0 ? integer(words[countWord - 1].text) : null;

  const rangeWord = words
    .map((word) => stripRules(word.text).match(/^(\d{2,5})-(\d{2,5})$/))
    .find((match) => match && Number(match[2]) > Number(match[1]));

  const totalWord = words
    .filter((word) => word.y <= footerY && inX(word, QTY_X))
    .map((word) => integer(word.text))
    .find((value): value is number => value !== null && value >= 1000);

  const poWord = words
    .map((word) => word.text.match(/P-?(\d{4,6})\b/i))
    .find((match) => match);

  const descriptionWords = words.filter(
    (word) => word.y > headerY && word.y < headerY + 60 && word.x > 100 && word.x < 300
  );

  return {
    pallets,
    declaredCount: declared,
    range: rangeWord ? [Number(rangeWord[1]), Number(rangeWord[2])] : null,
    grandTotal: totalWord ?? null,
    headerPo: poWord ? poWord[1] : null,
    description: descriptionWords.map((word) => word.text).join(" ")
  };
};

/** The most common value, or null - ties go to the first one seen. */
const mostCommon = <T,>(values: T[], key: (value: T) => string = String): T | null => {
  const counts = new Map<string, { value: T; count: number }>();

  for (const value of values) {
    const entry = counts.get(key(value)) ?? { value, count: 0 };
    entry.count += 1;
    counts.set(key(value), entry);
  }

  let best: { value: T; count: number } | null = null;
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;

  return best?.value ?? null;
};

/**
 * Settles a number from its OCR readings plus one vote from the code. It's
 * sure when every reading agrees, or when the code sides with a clear
 * majority; otherwise the best guess is kept and the row flagged.
 */
const decide = (reads: number[], codeVote: number | null) => {
  // The code's vote only counts towards something the Item column also read
  // (its 61 for an M20X60 shouldn't outvote anything), unless nothing read.
  const counts = codeVote !== null && (reads.includes(codeVote) || !reads.length);
  const value = mostCommon(counts ? [...reads, codeVote!] : reads);
  const backers = reads.filter((read) => read === value).length;
  const sure =
    reads.length > 0 &&
    (backers === reads.length || (value === codeVote && backers > reads.length / 2));

  return { value, sure };
};

const parse = (pages: PdfPageText[]): ParsedLine[] => {
  const passes = pages
    .flatMap((page) => page.passes ?? [page.words])
    .map(readPass)
    .filter((pass) => pass.pallets.length > 0);

  if (!passes.length) return [];

  // Passes that found a different number of pallets than most of them did
  // have misplaced a row, so their per-pallet readings would land on the
  // wrong pallet - they're left out.
  const count = mostCommon(passes.map((pass) => pass.pallets.length))!;
  const agreeing = passes.filter((pass) => pass.pallets.length === count);

  const declared = mostCommon(
    passes.map((pass) => pass.declaredCount).filter((value): value is number => value !== null)
  );
  const range = mostCommon(
    passes.map((pass) => pass.range).filter((value): value is [number, number] => value !== null),
    (value) => value.join("-")
  );
  const grandTotal = mostCommon(
    passes.map((pass) => pass.grandTotal).filter((value): value is number => value !== null)
  );
  const po =
    mostCommon(passes.map((pass) => pass.headerPo).filter((value): value is string => !!value)) ??
    mostCommon(agreeing.flatMap((pass) => pass.pallets.flatMap((pallet) => pallet.pos)));

  // Where the pallet numbers start: every legible Pkgs # votes for it.
  const startVotes = agreeing.flatMap((pass) =>
    pass.pallets
      .filter((pallet) => pallet.pkgs !== null)
      .map((pallet) => pallet.pkgs! - pallet.index)
  );
  if (range && range[1] - range[0] + 1 === count) {
    startVotes.push(range[0], range[0]);
  }
  const start = mostCommon(startVotes);

  const description = passes.map((pass) => pass.description).join(" ");
  // "Screw/Nuts & Washer" (ISO4017/4032/7091) - bolt, nut and washer
  // together. OCR often turns Nuts into "Muts", so the washer decides.
  const assembled = /WASHER|4032|7091/i.test(description);

  // The finish is the same down the whole list in practice, and its column
  // reads unreliably row by row ("HGG", "MHDG", "IDG"), so it's decided once.
  const finishText = agreeing
    .flatMap((pass) => pass.pallets.flatMap((pallet) => pallet.finish))
    .join(" ");
  const finish = /HDG|HD[GC]|[HM]?[DG]G\b/.test(finishText) ? "HDG" : finishSuffix(finishText);

  const qtyOptions: Set<number>[] = [];

  // What each code letter means on this list, eg A -> 12, from the pallets
  // whose Item column did read.
  const letterVotes = new Map<string, number[]>();
  for (let index = 0; index < count; index += 1) {
    const readings = agreeing.map((pass) => pass.pallets[index]);
    const letter = mostCommon(readings.flatMap((pallet) => pallet.codes.map((code) => code.letter)));
    const diam = mostCommon(readings.flatMap((pallet) => pallet.sizes.map(([value]) => value)));
    if (letter && diam !== null) letterVotes.set(letter, [...(letterVotes.get(letter) ?? []), diam]);
  }
  const diamByLetter = new Map(
    [...letterVotes].map(([letter, diams]) => [letter, mostCommon(diams)!] as const)
  );

  const lines: ParsedLine[] = Array.from({ length: count }, (_, index) => {
    const readings = agreeing.map((pass) => pass.pallets[index]);
    const review: string[] = [];

    // In Bags x In Pcs/Bag reads too patchily to stand on its own (a missed
    // bag row throws it right off), so it only breaks a tie between Total
    // Qty readings.
    const qtyReads = readings
      .map((pallet) => pallet.qty)
      .filter((value): value is number => value !== null);
    const bagsQtys = readings
      .map((pallet) => pallet.bagsQty)
      .filter((value): value is number => value !== null);
    const qty = mostCommon([
      ...qtyReads,
      ...qtyReads.filter((value) => bagsQtys.includes(value))
    ]);
    qtyOptions.push(new Set(qtyReads));

    // Diameter and length are voted on separately. The Item column's
    // readings count once each; the code adds a vote for the diameter its
    // letter stands for on this list and for its own length - so a pallet
    // whose Item column never read still gets a size, and a split reading
    // (M20X50 / M20X60) can be settled by the code.
    const sizes = readings.flatMap((pallet) => pallet.sizes);
    const codes = readings.flatMap((pallet) => pallet.codes);
    const letter = mostCommon(codes.map((code) => code.letter));
    const letterDiam = letter ? diamByLetter.get(letter) ?? null : null;
    const codeLength = mostCommon(
      codes.map((code) => code.length).filter((value): value is number => value !== null)
    );

    const diamVotes = sizes.map(([diam]) => diam);
    const lengthVotes = sizes.map(([, length]) => length);
    const diam = decide(diamVotes, letterDiam);
    const length = decide(lengthVotes, codeLength);
    const size: [number, number] | null =
      diam.value !== null && length.value !== null ? [diam.value, length.value] : null;

    if (!size) review.push("Size could not be read - check it against the PDF");
    else if (!diam.sure || !length.sure) {
      const seen = [...new Set(sizes.map((value) => value.join(" X ")))];
      review.push(
        seen.length
          ? `Size read as ${seen.join(" / ")} - check it`
          : `Size worked out from the code ${letter ?? ""}${codeLength ?? ""} - check it`
      );
    }

    if (!finish) review.push("Finish could not be read - assumed HDG");

    const pallet = start !== null ? String(start + index) : "";
    if (!pallet) review.push("Pallet number could not be read");

    return {
      pallet,
      cat: assembled ? "ASSEMBLED" : "BOLTS",
      item: `${assembled ? "ASS" : "BOLT"} ${finish ?? "HDG"}`,
      code: null,
      diamValue: size ? size[0] : null,
      lengthValue: size ? size[1] : null,
      diamDisplay: size ? String(size[0]) : "",
      lengthDisplay: size ? String(size[1]) : "",
      sizeOverride: null,
      qty,
      po: po ?? "",
      description: "",
      rawSize: size ? `M${size[0]}X${size[1]}` : "",
      review
    };
  });

  // The printed grand total settles a quantity no pass could read, and
  // catches a misread one.
  if (grandTotal !== null) {
    const missing = lines.filter((line) => line.qty === null);
    const known = lines.reduce((sum, line) => sum + (line.qty ?? 0), 0);

    if (missing.length === 1 && grandTotal > known) {
      missing[0].qty = grandTotal - known;
      missing[0].review.push(
        `Quantity unreadable - worked out from the printed total of ${grandTotal}`
      );
    } else if (missing.length === 0 && known !== grandTotal) {
      // A pallet whose passes read its quantity differently - if one of its
      // other readings makes the total come right, that's the one.
      const fixes = lines.flatMap((line, index) =>
        [...qtyOptions[index]]
          .filter((option) => known - line.qty! + option === grandTotal)
          .map((option) => ({ line, option }))
      );

      if (fixes.length === 1) {
        fixes[0].line.qty = fixes[0].option;
      } else {
        for (const line of lines) {
          line.review.push(`Quantities add up to ${known}, not the printed total of ${grandTotal}`);
        }
      }
    }
  }

  // Passes that disagreed on a quantity only matter when the grand total
  // hasn't already vouched for every quantity together.
  const totalConfirmed =
    grandTotal !== null && lines.reduce((sum, line) => sum + (line.qty ?? 0), 0) === grandTotal;

  lines.forEach((line, index) => {
    if (!totalConfirmed && qtyOptions[index].size > 1) {
      line.review.push(`Total Qty read as ${[...qtyOptions[index]].join(" / ")} - check it`);
    }
  });

  for (const line of lines) {
    if (line.qty === null) line.review.push("Quantity could not be read");
  }

  if (declared !== null && declared !== count) {
    for (const line of lines) {
      line.review.push(`Found ${count} pallets but the packing list says ${declared} Pkgs.`);
    }
  }

  return lines;
};

export const hamidi: SupplierRules = {
  id: "HAMIDI",
  label: "HAMIDI",
  ready: true,
  ocr: [
    { scale: 4, threshold: 150 },
    { scale: 4, threshold: 170 },
    { scale: 3, threshold: 170 }
  ],
  notes: [
    "One row per pallet (Pkgs #). The pallet's two bag rows (a full layer plus a part bag) are combined into its Total Qty.",
    "Pallet numbers come from the Pkgs # column and the marks range (eg 816-826), and run on one from another.",
    "Size is read from the Item column, eg M12X40 -> 12 X 40, with the code (APM A40R) as a cross-check on the length.",
    "cat is ASSEMBLED and item ASS HDG when the goods are 'Screw/Nuts & Washer'; otherwise BOLTS / BOLT. The finish comes from the Finish column.",
    "PO is the Buyer's Order No. (P-2578 -> 2578).",
    "These packing lists come as scans. The page is read by OCR three times at different contrast levels and each field goes with what the readings agree on. A quantity no reading could make out is worked out from the printed grand total - check flagged rows against the PDF."
  ],
  parse
};
