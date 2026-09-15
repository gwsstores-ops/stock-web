import type { ContainerRow, ParsedLine } from "./types";
import { padPallet, toCsvNumber } from "./rules";

export const CSV_HEADER = [
  "area",
  "cont",
  "pal",
  "location",
  "cat",
  "item",
  "diam_value",
  "length_value",
  "size",
  "qty",
  "diam_display",
  "length_display",
  "NOTE",
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
      row.location,
      row.cat ?? "",
      row.item ?? "",
      toCsvNumber(row.diamValue),
      toCsvNumber(row.lengthValue),
      row.size,
      row.qty === null ? "" : String(row.qty),
      row.diamDisplay,
      row.lengthDisplay,
      row.location,
      row.po
    ]
      .map(escapeCell)
      .join(",")
  );

  return [CSV_HEADER.join(","), ...lines].join("\n");
};
