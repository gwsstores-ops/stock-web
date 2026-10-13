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
 * A pallet that carries more than one product (a MIX pallet) gets one full
 * label per product rather than squeezing them into one slot: each copy
 * shows the bare pallet number in the diamond plus a small "MIX-n" tag
 * beside it, and the pallet id in the footer splits onto two lines, eg
 * "YF849_06" / "(MIX-2)".
 */
import type { ContainerRow } from "./containers/types";
import {
  BASELINE_EM,
  BLACK_HIGHLIGHT,
  CONTENT_W,
  LINE_EM,
  MARGIN,
  PAGE_H,
  PAGE_W,
  formatLabelDate,
  highlightFor
} from "./labelPdf";

type Doc = InstanceType<typeof import("jspdf").jsPDF>;

const LABELS_PER_PAGE = 2;
const SLOT_H = (PAGE_H - MARGIN * 2) / LABELS_PER_PAGE;

const ITEM_MAX_PT = 92;
const SIZE_MAX_PT = 104;
const QTY_MAX_PT = 72;
const BLOCK_MIN_PT = 16;
const ITEM_SIZE_GAP_PT = 10;

const DIAMOND_RX = 42;
const DIAMOND_RY = 38;
const DIAMOND_MAX_PT = 48;

const MIX_TAG_PT = 20;
const MIX_TAG_PAD_X = 8;
const MIX_TAG_PAD_Y = 5;
const MIX_TAG_GAP_PT = 10;

const ID_PT = 32;
const DATE_PT = 36;
const QR_PT = 46;
const FOOTER_GAP_PT = 10;
const FOOTER_PAD_PT = 10;

const HIGHLIGHT_PAD_PT = 6;

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

const fit = (doc: Doc, text: string, max: number, width: number) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(max);
  const measured = doc.getTextWidth(text);
  return measured > width ? Math.max(BLOCK_MIN_PT, (max * width) / measured) : max;
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

  const pt = fit(doc, label, DIAMOND_MAX_PT, DIAMOND_RX * 1.7);
  doc.setFontSize(pt);
  doc.setTextColor(...BLACK_HIGHLIGHT.text);
  doc.text(label, cx, cy + pt * 0.32, { align: "center" });
  doc.setTextColor(0, 0, 0);
};

/** The small "MIX-n" flag that sits just to the left of the diamond. */
const drawMixTag = (doc: Doc, diamondCx: number, diamondCy: number, mixLabel: string) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(MIX_TAG_PT);
  const textWidth = doc.getTextWidth(mixLabel);
  const tagW = textWidth + MIX_TAG_PAD_X * 2;
  const tagH = MIX_TAG_PT + MIX_TAG_PAD_Y * 2;
  const tagRight = diamondCx - DIAMOND_RX - MIX_TAG_GAP_PT;
  const tagLeft = tagRight - tagW;
  const tagTop = diamondCy - tagH / 2;

  doc.setFillColor(...BLACK_HIGHLIGHT.fill);
  doc.roundedRect(tagLeft, tagTop, tagW, tagH, 4, 4, "F");

  doc.setTextColor(...BLACK_HIGHLIGHT.text);
  doc.text(mixLabel, tagLeft + MIX_TAG_PAD_X, tagTop + tagH / 2 + MIX_TAG_PT * 0.32);
  doc.setTextColor(0, 0, 0);
};

const drawSlot = async (doc: Doc, QRCode: typeof import("qrcode"), row: ContainerRow, slotTop: number, dateText: string) => {
  const item = (row.item ?? "").trim().toUpperCase();
  const size = row.size.trim().toUpperCase();
  const qty = row.qty ?? 0;

  const mixMatch = row.pal.match(MIX_PALLET_PATTERN);
  const palletLabel = mixMatch ? mixMatch[1] : row.pal;
  const mixLabel = mixMatch ? mixMatch[2] : null;

  // The pallet id's own MIX suffix (eg "(MIX-2)") is split onto a second
  // footer line rather than run on with the rest of the id.
  const idLines = mixMatch
    ? [row.location.replace(/\s*\(MIX-\d+\)$/, "").toUpperCase(), `(${mixMatch[2]})`]
    : [row.location.toUpperCase()];

  const footerTextH = ID_PT * LINE_EM * idLines.length;
  const footerH = Math.max(QR_PT, footerTextH);

  const naturalItemPt = fit(doc, item, ITEM_MAX_PT, CONTENT_W);
  const naturalSizePt = fit(doc, size, SIZE_MAX_PT, CONTENT_W);
  const naturalQtyPt = fit(doc, `= ${QTY_FORMAT.format(qty)}`, QTY_MAX_PT, CONTENT_W);

  const naturalTextHeight = (naturalItemPt + naturalSizePt + naturalQtyPt) * LINE_EM;
  const fixedGaps = ITEM_SIZE_GAP_PT * 2;
  const roomForText = SLOT_H - footerH - FOOTER_GAP_PT - FOOTER_PAD_PT * 2 - fixedGaps;
  const scale = naturalTextHeight > roomForText ? roomForText / naturalTextHeight : 1;

  const itemPt = Math.max(BLOCK_MIN_PT, naturalItemPt * scale);
  const sizePt = Math.max(BLOCK_MIN_PT, naturalSizePt * scale);
  const qtyPt = Math.max(BLOCK_MIN_PT, naturalQtyPt * scale);

  let y = slotTop + FOOTER_PAD_PT;

  const highlight = highlightFor(item);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(itemPt);
  const itemWidth = doc.getTextWidth(item);
  const itemX = MARGIN + (CONTENT_W - itemWidth) / 2;
  const itemBaseline = y + itemPt * BASELINE_EM;

  if (highlight) drawHighlightBar(doc, item, itemPt, itemX, y, highlight);

  doc.setTextColor(...(highlight?.text ?? [0, 0, 0]));
  doc.text(item, PAGE_W / 2, itemBaseline, { align: "center" });

  const underlineY = itemBaseline + itemPt * 0.09;
  doc.setDrawColor(...(highlight?.text ?? [0, 0, 0]));
  doc.setLineWidth(itemPt / 14);
  doc.line(itemX, underlineY, itemX + itemWidth, underlineY);
  doc.setDrawColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);

  y += itemPt * LINE_EM + ITEM_SIZE_GAP_PT;

  doc.setFontSize(sizePt);
  doc.text(size, MARGIN, y + sizePt * BASELINE_EM);
  y += sizePt * LINE_EM + ITEM_SIZE_GAP_PT;

  doc.setFontSize(qtyPt);
  doc.text(`= ${QTY_FORMAT.format(qty)}`, MARGIN, y + qtyPt * BASELINE_EM);
  const diamondCy = y + (qtyPt * LINE_EM) / 2;
  y += qtyPt * LINE_EM;

  const diamondCx = PAGE_W - MARGIN - DIAMOND_RX;
  drawDiamond(doc, diamondCx, diamondCy, palletLabel);
  if (mixLabel) drawMixTag(doc, diamondCx, diamondCy, mixLabel);

  // Footer: QR code, pallet id and today's date, pinned to the foot of the slot.
  const footerY = slotTop + SLOT_H - footerH;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(ID_PT);
  const idWidth = Math.max(...idLines.map((line) => doc.getTextWidth(line)));
  const barWidth = idWidth + HIGHLIGHT_PAD_PT * 2 + QR_PT + 6;

  doc.setFillColor(0, 0, 0);
  doc.rect(MARGIN, footerY, barWidth, footerH, "F");

  doc.setTextColor(255, 255, 255);
  idLines.forEach((line, i) => {
    const lineY = footerY + footerH / 2 + (i - (idLines.length - 1) / 2) * ID_PT * LINE_EM + ID_PT * 0.32;
    doc.text(line, MARGIN + HIGHLIGHT_PAD_PT, lineY);
  });
  doc.setTextColor(0, 0, 0);

  const qr = await QRCode.toDataURL(row.location.toUpperCase(), {
    margin: 1,
    width: 300,
    errorCorrectionLevel: "M"
  });
  doc.addImage(qr, "PNG", MARGIN + idWidth + HIGHLIGHT_PAD_PT * 2, footerY + (footerH - QR_PT) / 2, QR_PT, QR_PT);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(DATE_PT);
  doc.text(dateText, PAGE_W - MARGIN, footerY + footerH / 2 + DATE_PT * 0.32, { align: "right" });
};
