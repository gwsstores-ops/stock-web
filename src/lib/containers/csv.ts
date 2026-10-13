import type { ContainerRow, ParsedLine } from "./types";
import { padPallet, toCsvNumber } from "./rules";

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
