/**
 * Draws the A4 pallet label as a PDF in the browser.
 *
 * Layout follows templates/label-template.docx: narrow margins, the item in
 * underlined bold capitals at the top (as large as fits the line, highlighted
 * grey when it contains HDG, or black with white text when it ends in SC), then one bold line per size (left
 * aligned, as big as the page allows but never larger than the item). The QR code, pallet ID and today's
 * date (dd-mm-yy) are pinned to the bottom of the page, with blank space between.
 * Text is measured, so a long item or size shrinks to stay on one line.
 */

export const MAX_SIZES = 5;

export type LabelInput = {
  item: string;
  sizes: string[];
  qtys?: string[];
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

  const item = input.item.trim().toUpperCase();
  const palletId = input.palletId.trim().toUpperCase();
  const rawQtys = input.qtys ?? [];
  const sizeEntries = input.sizes
    .map((s, i) => ({ size: s.trim().toUpperCase(), qty: (rawQtys[i] ?? "").trim() }))
    .filter((entry) => entry.size !== "");
  const sizes = sizeEntries.map((entry) => entry.size);
  const qtys = sizeEntries.map((entry) => entry.qty);
  const date = formatLabelDate(input.date ?? new Date());

  if (!item || !palletId || sizes.length === 0 || sizes.length > MAX_SIZES) {
    throw new Error("Item, at least one size and a pallet ID are required");
  }

  // The built-in PDF fonts only cover Latin-1; anything else would print as garbage
  for (const text of [item, palletId, ...sizes, ...qtys.filter(Boolean)]) {
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

  const itemPt = fill(item, ITEM_MAX_PT);
  const palletPt = fit(palletId, PALLET_PT);

  // QR code, pallet ID and date sit together at the bottom of the page
  const bottomHeight = QR_PT + palletPt * LINE_EM + GAP_PT + DATE_PT * LINE_EM;
  const bottomTop = PAGE_H - MARGIN - bottomHeight;

  // Space for the size lines: between the item and the bottom block
  const sizesTop = MARGIN + itemPt * LINE_EM + GAP_PT;
  const sizesRoom = bottomTop - GAP_PT - sizesTop;
  const heightCapPt = sizesRoom / sizes.length / LINE_EM;
  const sizePts = sizes.map((s, i) =>
    Math.max(SIZE_MIN_PT, Math.min(fitSize(s, qtys[i], SIZE_MAX_PT), heightCapPt, itemPt))
  );

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

  drawLine(item, itemPt, "center", true, highlightFor(item));

  y = sizesTop;
  sizes.forEach((size, i) => drawSizeLine(size, qtys[i], sizePts[i]));

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
