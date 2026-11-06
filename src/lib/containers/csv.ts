import type { ContainerRow, ParsedLine } from "./types";
import { padPallet, toCsvNumber } from "./rules";
import { parseCsv } from "@/lib/certs/combine";

// Matches stock_import_sync()'s reading of the old `stock` table: `location`
// is the bay a pallet sits in (every freshly landed pallet sits in the
// CONTAINER bay, regardless of which container it came off), and `pallet_id`
// is the pallet's own label - container reference + pallet number, eg
// YF701_01 - which is what used to be written under `location` here.
export const CSV_HEADER = [
  "area",
  "cont",
  "pal",
  "location",
  "pallet_id",
  "cat",
  "item",
  "diam_value",
  "length_value",
  "size",
  "qty",
  "diam_display",
  "length_display",
  "PO"
];

/** What makes two lines on the same pallet "the same stock" for MIX counting. */
const productKey = (line: ParsedLine) =>
  [line.cat, line.item, line.diamValue, line.lengthValue].join("|");

/**
 * Turns parsed lines into finished rows.
 *
 * A pallet carrying more than one distinct product is a mixed pallet and its
 * number gains a `(MIX-n)` suffix, where n counts the distinct products on it.
 * A pallet that simply appears twice with the same product - a split delivery
 * across two purchase orders, say - is not mixed and keeps its plain number.
 */
export const buildRows = (lines: ParsedLine[], cont: string): ContainerRow[] => {
  const products = new Map<string, Set<string>>();

  for (const line of lines) {
    const key = padPallet(line.pallet);
    const seen = products.get(key) ?? new Set<string>();
    seen.add(productKey(line));
    products.set(key, seen);
  }

  return lines.map((line) => {
    const base = padPallet(line.pallet);
    const distinct = products.get(base)?.size ?? 1;
    const pal = distinct > 1 ? `${base} (MIX-${distinct})` : base;
    const location = `${cont}_${pal}`;
    const size =
      line.sizeOverride ?? `${line.diamDisplay} X ${line.lengthDisplay}`;

    return { ...line, pal, location, size };
  });
};

const escapeCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const toCsv = (rows: ContainerRow[], cont: string): string => {
  const lines = rows.map((row) =>
    [
      "CONTAINER",
      cont,
      row.pal,
      "CONTAINER",
      row.location,
      row.cat ?? "",
      row.item ?? "",
      toCsvNumber(row.diamValue),
      toCsvNumber(row.lengthValue),
      row.size,
      row.qty === null ? "" : String(row.qty),
      row.diamDisplay,
      row.lengthDisplay,
      row.po
    ]
      .map(escapeCell)
      .join(",")
  );

  return [CSV_HEADER.join(","), ...lines].join("\n");
};

const MIX_SUFFIX = /\s*\(MIX-\d+\)\s*$/i;

const toNumber = (text: string): number | null => {
  const cleaned = text.replace(/,/g, "").trim();
  const value = Number(cleaned);
  return cleaned && Number.isFinite(value) ? value : null;
};

/**
 * Reads a pallet-label CSV back into lines - either one this tool wrote, or
 * one filled in by hand for a supplier with no rules yet. Only `item` and
 * `qty` are strictly needed for a label; the pallet number comes from `pal`,
 * or failing that from the end of `pallet_id` (eg YF701_01 -> 01). MIX
 * suffixes are dropped because buildRows works them out again.
 */
export const fromCsv = (text: string): { lines: ParsedLine[]; cont: string } => {
  const [header = [], ...data] = parseCsv(text);
  const columns = header.map((name) => name.trim().toLowerCase());
  const col = (name: string) => columns.indexOf(name);

  if (col("item") < 0 || col("qty") < 0) {
    throw new Error("The CSV needs at least an item and a qty column.");
  }

  let cont = "";

  const lines = data
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells): ParsedLine => {
      const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "").trim() : "");
      const palletId = get("pallet_id").replace(MIX_SUFFIX, "");
      const underscore = palletId.lastIndexOf("_");

      if (!cont) cont = get("cont") || (underscore > 0 ? palletId.slice(0, underscore) : "");

      const pallet =
        get("pal").replace(MIX_SUFFIX, "") ||
        (underscore > 0 ? palletId.slice(underscore + 1) : palletId);

      const diamDisplay = get("diam_display") || get("diam_value");
      const lengthDisplay = get("length_display") || get("length_value");
      const size = get("size").toUpperCase();
      const item = get("item").toUpperCase() || null;
      const qty = toNumber(get("qty"));

      const review: string[] = [];
      if (!pallet) review.push("No pallet number");
      if (!item) review.push("No item");
      if (qty === null) review.push("No qty");

      return {
        pallet,
        cat: get("cat").toUpperCase() || null,
        item,
        diamValue: toNumber(get("diam_value") || diamDisplay),
        lengthValue: toNumber(get("length_value") || lengthDisplay),
        diamDisplay,
        lengthDisplay,
        sizeOverride: size && size !== `${diamDisplay} X ${lengthDisplay}` ? size : null,
        qty,
        po: get("po"),
        description: "",
        rawSize: get("size"),
        review
      };
    });

  return { lines, cont: cont.toUpperCase() };
};
