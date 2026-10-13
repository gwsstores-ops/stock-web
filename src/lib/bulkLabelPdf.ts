/**
 * Draws a sheet of pallet labels straight from a Container Labels CSV - one
 * compact label per pallet, two to an A4 page, matching the layout the
 * warehouse already prints from (see SUPPLIER TEMPLATES/yonghi labels.pdf):
 * a bold underlined item heading (highlighted grey for HDG, black with white
 * text for SC, same rule as the single Pallet Label tool), the size, then
 * "= qty" on its own line, a diamond tag with the pallet number in the
 * corner, and a QR code / location / date strip pinned to the foot of each
 * label's half of the page.
 *
 * A pallet that carries more than one product (a MIX pallet) stacks all of
 * its item/size/qty blocks in the same half-page slot, shrinking them
 * together so they still fit - there's no sample of what a MIX label should
 * look like, so this is a reasonable extension of the single-product case
 * rather than a measured match.
 */
import type { ContainerRow } from "./containers/types";
import {
  BASELINE_EM,
  BLACK_HIGHLIGHT,
  CONTENT_W,
  type Highlight,
  LINE_EM,
  MARGIN,
  PAGE_H,
  PAGE_W,
  formatLabelDate,
  highlightFor
} from "./labelPdf";

const LABELS_PER_PAGE = 2;
const SLOT_H = (PAGE_H - MARGIN * 2) / LABELS_PER_PAGE;

const ITEM_MAX_PT = 92;
const SIZE_MAX_PT = 104;
const QTY_MAX_PT = 72;
const BLOCK_MIN_PT = 16;
const BLOCK_GAP_PT = 10;
const ITEM_SIZE_GAP_PT = 10;

const DIAMOND_RX = 42;
const DIAMOND_RY = 38;
const DIAMOND_MAX_PT = 48;

const ID_PT = 32;
const DATE_PT = 36;
const QR_PT = 46;
const FOOTER_GAP_PT = 10;
const FOOTER_H = QR_PT;
const FOOTER_PAD_PT = 10;

const HIGHLIGHT_PAD_PT = 6;

const QTY_FORMAT = new Intl.NumberFormat("en-IE");

type Block = { item: string; size: string; qty: number };
type PalletGroup = { location: string; pal: string; blocks: Block[] };

const groupByLocation = (rows: ContainerRow[]): PalletGroup[] => {
  const order: string[] = [];
  const groups = new Map<string, PalletGroup>();

  for (const row of rows) {
    if (!groups.has(row.location)) {
      groups.set(row.location, { location: row.location, pal: row.pal, blocks: [] });
      order.push(row.location);
    }

    groups.get(row.location)!.blocks.push({
      item: (row.item ?? "").trim().toUpperCase(),
      size: row.size.trim().toUpperCase(),
      qty: row.qty ?? 0
    });
  }

  return order.map((location) => groups.get(location)!);
};

export const buildBulkLabelPdf = async (
  rows: ContainerRow[],
  date?: Date
): Promise<Blob> => {
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

  const pallets = groupByLocation(rows);
  if (pallets.length === 0) throw new Error("No pallets to make labels for");

  const [{ jsPDF }, { default: QRCode }] = await Promise.all([
    import("jspdf"),
    import("qrcode")
  ]);

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const dateText = formatLabelDate(date ?? new Date());

  for (let i = 0; i < pallets.length; i += 1) {
    const slotIndex = i % LABELS_PER_PAGE;
    if (i > 0 && slotIndex === 0) doc.addPage();

    const slotTop = MARGIN + slotIndex * SLOT_H;
    await drawSlot(doc, QRCode, pallets[i], slotTop, dateText);
  }

  return doc.output("blob");
};

const fit = (doc: InstanceType<typeof import("jspdf").jsPDF>, text: string, max: number, width: number) => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(max);
  const measured = doc.getTextWidth(text);
  return measured > width ? Math.max(BLOCK_MIN_PT, (max * width) / measured) : max;
};

const drawHighlightBar = (
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  text: string,
  pt: number,
  x: number,
  y: number,
  highlight: Highlight
) => {
  const width = doc.getTextWidth(text);
  doc.setFillColor(...highlight.fill);
  doc.rect(x - HIGHLIGHT_PAD_PT, y, width + HIGHLIGHT_PAD_PT * 2, pt * LINE_EM, "F");
};

const drawDiamond = (
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  cx: number,
  cy: number,
  label: string
) => {
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

const drawSlot = async (
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  QRCode: typeof import("qrcode"),
  pallet: PalletGroup,
  slotTop: number,
  dateText: string
) => {
  const blockCount = pallet.blocks.length;

  // Natural (uncapped-by-room) heights for every heading/size/qty line, so a
  // pallet with several products shrinks them together rather than one at a
  // time running out of room.
  const naturalItemPts = pallet.blocks.map((b) => fit(doc, b.item, ITEM_MAX_PT, CONTENT_W));
  const naturalSizePts = pallet.blocks.map((b) => fit(doc, b.size, SIZE_MAX_PT, CONTENT_W));
  const naturalQtyPts = pallet.blocks.map((b) =>
    fit(doc, `= ${QTY_FORMAT.format(b.qty)}`, QTY_MAX_PT, CONTENT_W)
  );

  // The gaps between lines don't shrink - only the text does - so they're
  // fixed overhead subtracted up front, and the scale ratio applies to the
  // text height alone. Folding fixed gaps into the scaled total would leave
  // the actual drawn height bigger than the room available, by gaps*(1-scale).
  const naturalTextHeight =
    naturalItemPts.reduce((sum, pt) => sum + pt * LINE_EM, 0) +
    naturalSizePts.reduce((sum, pt) => sum + pt * LINE_EM, 0) +
    naturalQtyPts.reduce((sum, pt) => sum + pt * LINE_EM, 0);

  const fixedGaps = ITEM_SIZE_GAP_PT * blockCount * 2 + BLOCK_GAP_PT * Math.max(0, blockCount - 1);

  const roomForText = SLOT_H - FOOTER_H - FOOTER_GAP_PT - FOOTER_PAD_PT * 2 - fixedGaps;
  const scale = naturalTextHeight > roomForText ? roomForText / naturalTextHeight : 1;

  const itemPts = naturalItemPts.map((pt) => Math.max(BLOCK_MIN_PT, pt * scale));
  const sizePts = naturalSizePts.map((pt) => Math.max(BLOCK_MIN_PT, pt * scale));
  const qtyPts = naturalQtyPts.map((pt) => Math.max(BLOCK_MIN_PT, pt * scale));

  let y = slotTop + FOOTER_PAD_PT;
  let diamondCy = y;

  pallet.blocks.forEach((block, i) => {
    if (i > 0) y += BLOCK_GAP_PT;

    const highlight = highlightFor(block.item);
    const itemPt = itemPts[i];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(itemPt);
    const itemWidth = doc.getTextWidth(block.item);
    const itemX = MARGIN + (CONTENT_W - itemWidth) / 2;
    const baseline = y + itemPt * BASELINE_EM;

    if (highlight) drawHighlightBar(doc, block.item, itemPt, itemX, y, highlight);

    doc.setTextColor(...(highlight?.text ?? [0, 0, 0]));
    doc.text(block.item, PAGE_W / 2, baseline, { align: "center" });

    const underlineY = baseline + itemPt * 0.09;
    doc.setDrawColor(...(highlight?.text ?? [0, 0, 0]));
    doc.setLineWidth(itemPt / 14);
    doc.line(itemX, underlineY, itemX + itemWidth, underlineY);
    doc.setDrawColor(0, 0, 0);
    doc.setTextColor(0, 0, 0);

    y += itemPt * LINE_EM + ITEM_SIZE_GAP_PT;

    const sizePt = sizePts[i];
    doc.setFontSize(sizePt);
    doc.text(block.size, MARGIN, y + sizePt * BASELINE_EM);
    y += sizePt * LINE_EM + ITEM_SIZE_GAP_PT;

    const qtyPt = qtyPts[i];
    doc.setFontSize(qtyPt);
    doc.text(`= ${QTY_FORMAT.format(block.qty)}`, MARGIN, y + qtyPt * BASELINE_EM);

    // The diamond sits level with the first block's "= qty" line.
    if (i === 0) diamondCy = y + (qtyPt * LINE_EM) / 2;

    y += qtyPt * LINE_EM;
  });

  drawDiamond(doc, PAGE_W - MARGIN - DIAMOND_RX, diamondCy, pallet.pal.match(/^\d+/)?.[0] ?? pallet.pal);

  // Footer: QR code, location and today's date, pinned to the foot of the slot.
  const footerY = slotTop + SLOT_H - FOOTER_H;
  const locationText = pallet.location.toUpperCase();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(ID_PT);
  const idWidth = doc.getTextWidth(locationText);
  const barWidth = idWidth + HIGHLIGHT_PAD_PT * 2 + QR_PT + 6;

  doc.setFillColor(0, 0, 0);
  doc.rect(MARGIN, footerY, barWidth, QR_PT, "F");

  doc.setTextColor(255, 255, 255);
  doc.text(locationText, MARGIN + HIGHLIGHT_PAD_PT, footerY + QR_PT / 2 + ID_PT * 0.32);
  doc.setTextColor(0, 0, 0);

  const qr = await QRCode.toDataURL(locationText, { margin: 1, width: 300, errorCorrectionLevel: "M" });
  doc.addImage(qr, "PNG", MARGIN + idWidth + HIGHLIGHT_PAD_PT * 2, footerY, QR_PT, QR_PT);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(DATE_PT);
  doc.text(dateText, PAGE_W - MARGIN, footerY + QR_PT / 2 + DATE_PT * 0.32, { align: "right" });
};
