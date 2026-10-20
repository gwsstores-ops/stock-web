/**
 * Draws a sheet of pallet labels straight from a Container Labels CSV - one
 * compact label per CSV row, two to an A4 page, matching the layout already
 * in use (see SUPPLIER TEMPLATES/yonghi labels.pdf and YF849 LABELS.pdf): a
 * bold underlined item heading (highlighted grey for HDG, black with white
 * text for SC, same rule as the single Pallet Label tool), the size, then
 * "= qty" on its own line, a diamond tag with the pallet number in the
 * corner, and a QR code / pallet id / date strip pinned to the foot of each
 * label's half of the page.
 *
 * Every position below (baseline y offsets, x positions, font sizes) is
 * copied from measuring SUPPLIER TEMPLATES/YF849 LABELS.pdf's own text
 * layer directly, rather than computed - the reference lays every field out
 * at a fixed spot and only ever shrinks a line's font when its own text is
 * too wide to fit, never to make room for anything else on the label.
 *
 * A pallet that carries more than one product (a MIX pallet) gets one full
 * label per product rather than squeezing them into one slot: each copy
 * shows the bare pallet number in the diamond, with a black "MIX-n" band
 * running into the diamond from the left, and the pallet id in the footer splits onto two lines, eg
 * "YF849_06" / "(MIX-2)" - the diamond and date stay exactly where they'd
 * be for a plain pallet; only the footer's own height grows.
 */
import type { ContainerRow } from "./containers/types";
import {
  BASELINE_EM,
  BLACK_HIGHLIGHT,
  CONTENT_W,
  LINE_EM,
  MARGIN,
  PAGE_W,
  formatLabelDate,
  highlightFor
} from "./labelPdf";

type Doc = InstanceType<typeof import("jspdf").jsPDF>;

const LABELS_PER_PAGE = 2;
/** The vertical rhythm between one label's fields and the next label's - not half the page (there's a bit of unused margin top and bottom). */
const SLOT_H = 406.85;

const ITEM_BASELINE_Y = 74.46;
const ITEM_MAX_PT = 91.15;
const ITEM_CENTER_X = 268;

const SIZE_BASELINE_Y = 181.73;
const SIZE_MAX_PT = 104;
const SIZE_CENTER_X = 239;

const QTY_BASELINE_Y = 246.47;
const QTY_MAX_PT = 72;
const QTY_EQUALS_X = 117.37;
const QTY_VALUE_X = 179.19;

const DIAMOND_CX = 501;
const DIAMOND_CY = 243.53;
const DIAMOND_RX = 42;
const DIAMOND_RY = 38;
const DIAMOND_MAX_PT = 40;
/** The number sits in the diamond's fat middle, clear of its narrowing points. */
const DIAMOND_TEXT_W = DIAMOND_RX * 1.05;

const MIX_TAG_PT = 22;
/** Room left of the "MIX-n" text, and between it and the diamond's left point. */
const MIX_TAG_PAD_X = 12;
const MIX_TAG_H = DIAMOND_RY * 1.1;

const ID_PT = 34;
const FOOTER_ID_BASELINE_Y = 375.05;
const FOOTER_ID_BASELINE_Y_MIX: [number, number] = [341.52, 382.32];
const FOOTER_DATE_BASELINE_Y = 383.47;
const DATE_PT = 40;
const QR_PT = 40;

const HIGHLIGHT_PAD_PT = 6;
const BLOCK_MIN_PT = 16;

const QTY_FORMAT = new Intl.NumberFormat("en-IE");

/** Splits "06 (MIX-2)" into its bare pallet number and MIX tag, if any. */
const MIX_PALLET_PATTERN = /^(\d+)\s*\((MIX-\d+)\)$/;

export const buildBulkLabelPdf = async (rows: ContainerRow[], date?: Date): Promise<Blob> => {
  const missing = rows.filter((row) => !row.item || row.qty === null);
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} line${missing.length === 1 ? "" : "s"} ${
        missing.length === 1 ? "is" : "are"
      } missing an item or a quantity - fix ${
        missing.length === 1 ? "it" : "them"
      } in the Check column before making labels.`
    );
  }

  if (rows.length === 0) throw new Error("No lines to make labels for");

  const [{ jsPDF }, { default: QRCode }] = await Promise.all([
    import("jspdf"),
    import("qrcode")
  ]);

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const dateText = formatLabelDate(date ?? new Date());

  for (let i = 0; i < rows.length; i += 1) {
    const slotIndex = i % LABELS_PER_PAGE;
    if (i > 0 && slotIndex === 0) doc.addPage();

    const slotTop = MARGIN + slotIndex * SLOT_H;
    await drawSlot(doc, QRCode, rows[i], slotTop, dateText);
  }

  return doc.output("blob");
};

/** The largest font, up to `max`, that keeps `text` within `width` - shrinks only when the text itself would otherwise overflow. */
const fit = (doc: Doc, text: string, max: number, width: number) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(max);
  const measured = doc.getTextWidth(text);
  return measured > width ? Math.max(BLOCK_MIN_PT, (max * width) / measured) : max;
};

const drawCentered = (doc: Doc, text: string, pt: number, centerX: number, baselineY: number) => {
  doc.setFontSize(pt);
  doc.text(text, centerX, baselineY, { align: "center" });
};

const drawHighlightBar = (doc: Doc, text: string, pt: number, x: number, y: number, highlight: NonNullable<ReturnType<typeof highlightFor>>) => {
  const width = doc.getTextWidth(text);
  doc.setFillColor(...highlight.fill);
  doc.rect(x - HIGHLIGHT_PAD_PT, y, width + HIGHLIGHT_PAD_PT * 2, pt * LINE_EM, "F");
};

const drawDiamond = (doc: Doc, cx: number, cy: number, label: string) => {
  doc.setFillColor(...BLACK_HIGHLIGHT.fill);
  doc.lines(
    [
      [DIAMOND_RX, DIAMOND_RY],
      [-DIAMOND_RX, DIAMOND_RY],
      [-DIAMOND_RX, -DIAMOND_RY],
      [DIAMOND_RX, -DIAMOND_RY]
    ],
    cx,
    cy - DIAMOND_RY,
    [1, 1],
    "F",
    true
  );

  const pt = fit(doc, label, DIAMOND_MAX_PT, DIAMOND_TEXT_W);
  doc.setFontSize(pt);
  doc.setTextColor(...BLACK_HIGHLIGHT.text);
  doc.text(label, cx, cy + pt * 0.32, { align: "center" });
  doc.setTextColor(0, 0, 0);
};

/**
 * The "MIX-n" band: a black bar running in from the left into the diamond, so
 * the two read as one arrow-shaped tag. Drawn before the diamond, which then
 * covers the bar's right end.
 */
const drawMixTag = (doc: Doc, diamondCx: number, diamondCy: number, mixLabel: string) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(MIX_TAG_PT);
  const textWidth = doc.getTextWidth(mixLabel);
  const textRight = diamondCx - DIAMOND_RX - MIX_TAG_PAD_X;
  const tagLeft = textRight - textWidth - MIX_TAG_PAD_X;
  const tagTop = diamondCy - MIX_TAG_H / 2;

  doc.setFillColor(...BLACK_HIGHLIGHT.fill);
  doc.rect(tagLeft, tagTop, diamondCx - tagLeft, MIX_TAG_H, "F");

  doc.setTextColor(...BLACK_HIGHLIGHT.text);
  doc.text(mixLabel, textRight - textWidth, diamondCy + MIX_TAG_PT * 0.35);
  doc.setTextColor(0, 0, 0);
};

const drawSlot = async (doc: Doc, QRCode: typeof import("qrcode"), row: ContainerRow, slotTop: number, dateText: string) => {
  const item = (row.item ?? "").trim().toUpperCase();
  const size = row.size.trim().toUpperCase();
  const qty = row.qty ?? 0;
  const qtyText = QTY_FORMAT.format(qty);

  const mixMatch = row.pal.match(MIX_PALLET_PATTERN);
  const palletLabel = mixMatch ? mixMatch[1] : row.pal;
  const mixLabel = mixMatch ? mixMatch[2] : null;

  // Item heading: bold, underlined, centered on ITEM_CENTER_X (not the page
  // centre - that leaves the diamond's corner clear).
  const highlight = highlightFor(item);
  const itemPt = fit(doc, item, ITEM_MAX_PT, CONTENT_W);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(itemPt);
  const itemWidth = doc.getTextWidth(item);
  const itemX = ITEM_CENTER_X - itemWidth / 2;
  const itemBaseline = slotTop + ITEM_BASELINE_Y;

  if (highlight) drawHighlightBar(doc, item, itemPt, itemX, itemBaseline - itemPt * BASELINE_EM, highlight);

  doc.setTextColor(...(highlight?.text ?? [0, 0, 0]));
  drawCentered(doc, item, itemPt, ITEM_CENTER_X, itemBaseline);

  const underlineY = itemBaseline + itemPt * 0.09;
  doc.setDrawColor(...(highlight?.text ?? [0, 0, 0]));
  doc.setLineWidth(itemPt / 14);
  doc.line(itemX, underlineY, itemX + itemWidth, underlineY);
  doc.setDrawColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);

  // Size: centered on SIZE_CENTER_X.
  const sizePt = fit(doc, size, SIZE_MAX_PT, CONTENT_W);
  drawCentered(doc, size, sizePt, SIZE_CENTER_X, slotTop + SIZE_BASELINE_Y);

  // "= qty": the equals sign and the value sit at their own fixed columns,
  // not centered as one unit.
  const qtyPt = fit(doc, qtyText, QTY_MAX_PT, PAGE_W - MARGIN - QTY_VALUE_X);
  const qtyBaseline = slotTop + QTY_BASELINE_Y;
  doc.setFontSize(QTY_MAX_PT);
  doc.text("=", QTY_EQUALS_X, qtyBaseline);
  doc.setFontSize(qtyPt);
  doc.text(qtyText, QTY_VALUE_X, qtyBaseline);

  const diamondCy = slotTop + DIAMOND_CY;
  if (mixLabel) drawMixTag(doc, DIAMOND_CX, diamondCy, mixLabel);
  drawDiamond(doc, DIAMOND_CX, diamondCy, palletLabel);

  // Footer: pallet id (one line, or two for a MIX pallet), QR code and date.
  const idLines = mixMatch
    ? [row.location.replace(/\s*\(MIX-\d+\)$/, "").toUpperCase(), `(${mixMatch[2]})`]
    : [row.location.toUpperCase()];
  const idBaselines = mixMatch ? FOOTER_ID_BASELINE_Y_MIX : [FOOTER_ID_BASELINE_Y];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(ID_PT);
  const idWidth = Math.max(...idLines.map((line) => doc.getTextWidth(line)));
  const barWidth = idWidth + HIGHLIGHT_PAD_PT * 2 + QR_PT + 6;
  const barTop = slotTop + idBaselines[0] - ID_PT * BASELINE_EM - 4;
  const barBottom = slotTop + idBaselines[idBaselines.length - 1] + ID_PT * (1 - BASELINE_EM) + 4;

  doc.setFillColor(0, 0, 0);
  doc.rect(MARGIN, barTop, barWidth, barBottom - barTop, "F");

  doc.setTextColor(255, 255, 255);
  idLines.forEach((line, i) => doc.text(line, MARGIN + HIGHLIGHT_PAD_PT, slotTop + idBaselines[i]));
  doc.setTextColor(0, 0, 0);

  const qr = await QRCode.toDataURL(row.location.toUpperCase(), {
    margin: 1,
    width: 300,
    errorCorrectionLevel: "M"
  });
  doc.addImage(qr, "PNG", MARGIN + idWidth + HIGHLIGHT_PAD_PT * 2, (barTop + barBottom - QR_PT) / 2, QR_PT, QR_PT);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(DATE_PT);
  doc.text(dateText, PAGE_W - MARGIN, slotTop + FOOTER_DATE_BASELINE_Y, { align: "right" });
};
