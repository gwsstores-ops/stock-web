/**
 * Draws the A4 pallet label as a PDF in the browser.
 *
 * Layout follows templates/label-template.docx: narrow margins, one or more items stacked
 * top to bottom. Each item is printed in underlined bold capitals (as large as fits the line,
 * highlighted grey when it contains HDG, or black with white text when it ends in SC), followed
 * by one bold line per size (left aligned, as big as the page allows but never larger than its
 * own item). The QR code, pallet ID and today's date (dd-mm-yy) are pinned to the bottom of the
 * page, shared by every item, with blank space between. Text is measured, so a long item or size
 * shrinks to stay on one line.
 */

export const MAX_SIZES = 8;
export const MAX_ITEMS = 5;

export type ItemEntry = {
  item: string;
  sizes: string[];
  qtys?: string[];
};

export type LabelInput = {
  items: ItemEntry[];
  palletId: string;
  date?: Date;
};

// A4 portrait, in points
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 21.6;
const CONTENT_W = PAGE_W - MARGIN * 2;

// The item grows to fill the line, up to this font size
const ITEM_MAX_PT = 200;
const PALLET_PT = 30;
const DATE_PT = 66;

// Sizes grow to fill the space left, up to this font size
const SIZE_MAX_PT = 200;
const SIZE_MIN_PT = 20;

const QR_PT = 110;

type Rgb = [number, number, number];
type Highlight = { fill: Rgb; text: Rgb };

const HIGHLIGHT_PAD_PT = 6;
const GREY_HIGHLIGHT: Highlight = { fill: [185, 185, 185], text: [0, 0, 0] };
const BLACK_HIGHLIGHT: Highlight = { fill: [0, 0, 0], text: [255, 255, 255] };

// Items ending in SC: black with white text. Items containing HDG: grey.
// SC wins when an item is both, as it is the more specific rule.
const highlightFor = (item: string): Highlight | null => {
  if (/\bSC$/.test(item)) return BLACK_HIGHLIGHT;
  if (item.includes("HDG")) return GREY_HIGHLIGHT;
  return null;
};

// Height of a line of text as a fraction of its font size
const LINE_EM = 1.15;
// Baseline position within a line box, as a fraction of the font size
const BASELINE_EM = 0.92;
const GAP_PT = 12;

export function formatLabelDate(date: Date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

export async function buildLabelPdf(input: LabelInput): Promise<Blob> {
  const [{ jsPDF }, { default: QRCode }] = await Promise.all([
    import("jspdf"),
    import("qrcode")
  ]);

  const palletId = input.palletId.trim().toUpperCase();
  const date = formatLabelDate(input.date ?? new Date());

  const items = input.items
    .map((entry) => {
      const name = entry.item.trim().toUpperCase();
      const rawQtys = entry.qtys ?? [];
      const sizeEntries = entry.sizes
        .map((s, i) => ({ size: s.trim().toUpperCase(), qty: (rawQtys[i] ?? "").trim() }))
        .filter((e) => e.size !== "");
      return { name, sizes: sizeEntries.map((e) => e.size), qtys: sizeEntries.map((e) => e.qty) };
    })
    .filter((entry) => entry.name !== "" && entry.sizes.length > 0);

  if (
    !palletId ||
    items.length === 0 ||
    items.length > MAX_ITEMS ||
    items.some((entry) => entry.sizes.length > MAX_SIZES)
  ) {
    throw new Error("At least one item with a size, and a pallet ID, are required");
  }

  // The built-in PDF fonts only cover Latin-1; anything else would print as garbage
  const allText = [
    palletId,
    ...items.flatMap((entry) => [entry.name, ...entry.sizes, ...entry.qtys.filter(Boolean)])
  ];
  for (const text of allText) {
    const bad = [...text].find((ch) => ch.charCodeAt(0) > 0xff);
    if (bad) {
      throw new Error(`"${bad}" can't be printed on the label. Remove it and try again.`);
    }
  }

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  doc.setFont("helvetica", "bold");

  // Largest font, up to `max`, that keeps `text` on one line
  const fit = (text: string, max: number) => {
    doc.setFontSize(max);
    const width = doc.getTextWidth(text);
    return width > CONTENT_W ? Math.max(20, (max * CONTENT_W) / width) : max;
  };

  // Largest font, up to `max`, that fills the line: like `fit`, but short text grows too
  const fill = (text: string, max: number) => {
    doc.setFontSize(100);
    const width = doc.getTextWidth(text);
    return Math.max(20, Math.min(max, (100 * CONTENT_W) / width));
  };

  // A size's qty is printed right after it, in non-bold text: "20 X 80 =1000"
  const qtySuffix = (qty: string) => (qty ? ` =${qty}` : "");

  // Like `fit`, but measures the bold size text plus its non-bold qty suffix together
  const fitSize = (size: string, qty: string, max: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(max);
    const sizeWidth = doc.getTextWidth(size);
    const suffix = qtySuffix(qty);
    doc.setFont("helvetica", "normal");
    const suffixWidth = suffix ? doc.getTextWidth(suffix) : 0;
    doc.setFont("helvetica", "bold");
    const width = sizeWidth + suffixWidth;
    return width > CONTENT_W ? Math.max(20, (max * CONTENT_W) / width) : max;
  };

  // Each item's natural size, as if it had the whole page to itself: as large as its text
  // allows, up to the usual max. A size never outgrows its own item's heading.
  const itemNaturalPts = items.map((entry) => fill(entry.name, ITEM_MAX_PT));
  const sizeNaturalPtsByItem = items.map((entry, i) =>
    entry.sizes.map((s, j) => Math.min(fitSize(s, entry.qtys[j], SIZE_MAX_PT), itemNaturalPts[i]))
  );

  const palletPt = fit(palletId, PALLET_PT);

  // QR code, pallet ID and date sit together at the bottom of the page
  const bottomHeight = QR_PT + palletPt * LINE_EM + GAP_PT + DATE_PT * LINE_EM;
  const bottomTop = PAGE_H - MARGIN - bottomHeight;

  // Space for the items: between the top margin and the bottom block, minus the gap below
  // each heading and the gap between each pair of items
  const contentRoom = bottomTop - GAP_PT - MARGIN;
  const gaps = GAP_PT * items.length + GAP_PT * Math.max(0, items.length - 1);
  const roomForText = contentRoom - gaps;

  const naturalTextHeight =
    itemNaturalPts.reduce((sum, pt) => sum + pt * LINE_EM, 0) +
    sizeNaturalPtsByItem.reduce((sum, pts) => sum + pts.reduce((s, pt) => s + pt * LINE_EM, 0), 0);

  // If everything drawn at its natural size would overflow the page, shrink every item
  // heading and size line together by the same proportion, so items stay slightly larger
  // than their own sizes no matter how many items or sizes are on the label
  const scale = naturalTextHeight > roomForText ? roomForText / naturalTextHeight : 1;

  const itemPts = itemNaturalPts.map((pt) => Math.max(SIZE_MIN_PT, pt * scale));
  const sizePtsByItem = sizeNaturalPtsByItem.map((pts) => pts.map((pt) => Math.max(SIZE_MIN_PT, pt * scale)));

  let y = MARGIN;

  const drawLine = (
    text: string,
    pt: number,
    align: "left" | "center",
    underline = false,
    highlight: Highlight | null = null
  ) => {
    doc.setFontSize(pt);
    const x = align === "center" ? PAGE_W / 2 : MARGIN;
    const baseline = y + pt * BASELINE_EM;

    if (highlight) {
      const width = doc.getTextWidth(text);
      const left = align === "center" ? x - width / 2 : x;
      doc.setFillColor(...highlight.fill);
      doc.rect(
        left - HIGHLIGHT_PAD_PT,
        y,
        width + HIGHLIGHT_PAD_PT * 2,
        pt * LINE_EM,
        "F"
      );
    }

    const textColor = highlight?.text ?? [0, 0, 0];
    doc.setTextColor(...textColor);
    doc.setDrawColor(...textColor);
    doc.text(text, x, baseline, { align });

    if (underline) {
      const width = doc.getTextWidth(text);
      const left = align === "center" ? x - width / 2 : x;
      doc.setLineWidth(pt / 14);
      doc.line(left, baseline + pt * 0.09, left + width, baseline + pt * 0.09);
    }

    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);

    y += pt * LINE_EM;
  };

  // A size line, with its qty (if any) appended in non-bold text right after it
  const drawSizeLine = (size: string, qty: string, pt: number) => {
    const baseline = y + pt * BASELINE_EM;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(pt);
    doc.text(size, MARGIN, baseline);

    const suffix = qtySuffix(qty);
    if (suffix) {
      const sizeWidth = doc.getTextWidth(size);
      doc.setFont("helvetica", "normal");
      doc.text(suffix, MARGIN + sizeWidth, baseline);
      doc.setFont("helvetica", "bold");
    }

    y += pt * LINE_EM;
  };

  items.forEach((entry, i) => {
    if (i > 0) y += GAP_PT;
    drawLine(entry.name, itemPts[i], "center", true, highlightFor(entry.name));
    y += GAP_PT;
    entry.sizes.forEach((size, j) => drawSizeLine(size, entry.qtys[j], sizePtsByItem[i][j]));
  });

  y = bottomTop;

  const qr = await QRCode.toDataURL(palletId, {
    margin: 1,
    width: 300,
    errorCorrectionLevel: "M"
  });
  doc.addImage(qr, "PNG", MARGIN, y, QR_PT, QR_PT);
  y += QR_PT;

  drawLine(palletId, palletPt, "left");

  y += GAP_PT;
  drawLine(date, DATE_PT, "center");

  return doc.output("blob");
}
