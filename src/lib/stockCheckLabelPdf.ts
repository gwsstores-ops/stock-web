/**
 * Draws the Stock Check "Labels to print" list as a sheet of pallet labels -
 * one label per row, two to an A4 page - matching the layout of the sample
 * the yard already prints from the Export CSV: a bold underlined item heading
 * (on a full-width grey band for HDG, black with white text for SC, same rule
 * as the other label tools), the size below it, "= qty" when the row has a
 * quantity, and a footer with the QR code over the pallet ID (white on a
 * black tab in the bottom-left corner), the location in small italics, and
 * today's date on the right.
 *
 * Every position below is measured from the sample PDF's own content stream,
 * relative to the top-left corner of each label. Each label is a rounded
 * rectangle; the item band and the pallet ID tab follow its corners.
 */
import { formatLabelDate, highlightFor } from "./labelPdf";

type Doc = InstanceType<typeof import("jspdf").jsPDF>;

export type StockCheckLabelRow = {
  location: string;
  pallet_id?: string | null;
  item: string;
  size: string;
  qty: number | null;
};

const LABEL_X = 14.7;
const LABEL_TOPS = [14.1, 421.0];
const LABEL_W = 565.8;
const LABEL_H = 406.86;
const CORNER_R = 8.5;
const CENTER_X = LABEL_W / 2;
/** Room either side of a line that has to shrink to fit. */
const TEXT_PAD = 36;

const BAND_H = 120.6;

const ITEM_PT = 96;
const ITEM_BASELINE_Y = 93.22;
const UNDERLINE_OFFSET = 10.18;
const UNDERLINE_H = 10.08;

const SIZE_PT = 96;
const SIZE_BASELINE_Y = 200.47;

const QTY_PT = 52;
const QTY_BASELINE_Y = 258.9;
const QTY_EQUALS_X = 262.6;
const QTY_VALUE_X = 299.9;

const QR_X = 31.4;
const QR_Y = 291.3;
const QR_PT = 64.25;

const ID_TAB_W = 139.35;
const ID_TAB_H = 48.71;
const ID_PT = 30;
const ID_X = 13.92;
const ID_BASELINE_Y = 393.07;

const LOCATION_PT = 20;
const LOCATION_X = 185;
const LOCATION_BASELINE_Y = 394.37;

const DATE_PT = 52;
const DATE_RIGHT_X = 552.5;
const DATE_BASELINE_Y = 386.9;

const MIN_PT = 16;

const QTY_FORMAT = new Intl.NumberFormat("en-IE");

export const buildStockCheckLabelPdf = async (rows: StockCheckLabelRow[], date?: Date): Promise<Blob> => {
  if (rows.length === 0) throw new Error("No labels to print");

  const missing = rows.filter((row) => !(row.pallet_id ?? "").trim());
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} label${missing.length === 1 ? " has" : "s have"} no pallet ID - add ${
        missing.length === 1 ? "it" : "them"
      } before printing.`
    );
  }

  // The built-in PDF fonts only cover Latin-1; anything else would print as garbage
  for (const row of rows) {
    for (const text of [row.location, row.pallet_id ?? "", row.item, row.size]) {
      const bad = [...text].find((ch) => ch.charCodeAt(0) > 0xff);
      if (bad) throw new Error(`"${bad}" in ${row.pallet_id} can't be printed on a label. Remove it and try again.`);
    }
  }

  const [{ jsPDF }, { default: QRCode }] = await Promise.all([import("jspdf"), import("qrcode")]);

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const dateText = formatLabelDate(date ?? new Date());

  for (let i = 0; i < rows.length; i += 1) {
    const slot = i % LABEL_TOPS.length;
    if (i > 0 && slot === 0) doc.addPage();
    await drawLabel(doc, QRCode, rows[i], LABEL_X, LABEL_TOPS[slot], dateText);
  }

  return doc.output("blob");
};

/** The largest font, up to `max`, that keeps `text` within `width`. */
const fit = (doc: Doc, text: string, max: number, width: number) => {
  doc.setFontSize(max);
  const measured = doc.getTextWidth(text);
  return measured > width ? Math.max(MIN_PT, (max * width) / measured) : max;
};

const drawLabel = async (
  doc: Doc,
  QRCode: typeof import("qrcode"),
  row: StockCheckLabelRow,
  left: number,
  top: number,
  dateText: string
) => {
  const item = row.item.trim().toUpperCase();
  const size = row.size.trim().toUpperCase();
  const palletId = (row.pallet_id ?? "").trim().toUpperCase();
  const location = row.location.trim().toUpperCase();

  // Item band: full label width, rounded at the top to follow the label's corners
  const highlight = highlightFor(item);
  if (highlight) {
    doc.setFillColor(...highlight.fill);
    doc.roundedRect(left, top, LABEL_W, BAND_H, CORNER_R, CORNER_R, "F");
    doc.rect(left, top + BAND_H - CORNER_R, LABEL_W, CORNER_R, "F");
  }

  const textColor = highlight?.text ?? [0, 0, 0];
  doc.setFont("helvetica", "bold");
  const itemPt = fit(doc, item, ITEM_PT, LABEL_W - TEXT_PAD * 2);
  doc.setFontSize(itemPt);
  const itemBaseline = top + ITEM_BASELINE_Y - (ITEM_PT - itemPt) * 0.26;
  const itemWidth = doc.getTextWidth(item);
  doc.setTextColor(...textColor);
  doc.text(item, left + CENTER_X, itemBaseline, { align: "center" });
  doc.setFillColor(...textColor);
  doc.rect(
    left + CENTER_X - itemWidth / 2,
    itemBaseline + (UNDERLINE_OFFSET * itemPt) / ITEM_PT,
    itemWidth,
    (UNDERLINE_H * itemPt) / ITEM_PT,
    "F"
  );
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(fit(doc, size, SIZE_PT, LABEL_W - TEXT_PAD * 2));
  doc.text(size, left + CENTER_X, top + SIZE_BASELINE_Y, { align: "center" });

  // "= qty": the equals sign and the value sit at their own fixed columns, not bold
  if (row.qty) {
    const qtyText = QTY_FORMAT.format(row.qty);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(QTY_PT);
    doc.text("=", left + QTY_EQUALS_X, top + QTY_BASELINE_Y);
    doc.setFontSize(fit(doc, qtyText, QTY_PT, LABEL_W - TEXT_PAD - QTY_VALUE_X));
    doc.text(qtyText, left + QTY_VALUE_X, top + QTY_BASELINE_Y);
  }

  const qr = await QRCode.toDataURL(palletId, { margin: 4, width: 300, errorCorrectionLevel: "M" });
  doc.addImage(qr, "PNG", left + QR_X, top + QR_Y, QR_PT, QR_PT);

  // Pallet ID tab: black, rounded only in the label's bottom-left corner
  const tabTop = top + LABEL_H - ID_TAB_H;
  doc.setFillColor(0, 0, 0);
  doc.roundedRect(left, tabTop, ID_TAB_W, ID_TAB_H, CORNER_R, CORNER_R, "F");
  doc.rect(left, tabTop, ID_TAB_W, CORNER_R, "F");
  doc.rect(left + ID_TAB_W - CORNER_R, tabTop, CORNER_R, ID_TAB_H, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(fit(doc, palletId, ID_PT, ID_TAB_W - ID_X * 2));
  doc.setTextColor(255, 255, 255);
  doc.text(palletId, left + ID_X, top + ID_BASELINE_Y);
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(fit(doc, location, LOCATION_PT, DATE_RIGHT_X - DATE_PT * 4.1 - LOCATION_X));
  doc.text(location, left + LOCATION_X, top + LOCATION_BASELINE_Y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(DATE_PT);
  doc.text(dateText, left + DATE_RIGHT_X, top + DATE_BASELINE_Y, { align: "right" });
};
