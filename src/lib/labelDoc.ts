/**
 * Fills public/label-template.docx (A4 pallet label) in the browser.
 *
 * The template holds {ITEM}, four {SIZE} lines, {QR PALLET ID}, {PALLET ID}
 * and a date. Unused {SIZE} lines are removed, the {QR PALLET ID} line becomes
 * a QR code of the pallet ID (the value QR Move reads), and the date is
 * replaced with today's date as dd-mm-yy.
 */

export const MAX_SIZES = 4;

export type LabelInput = {
  item: string;
  sizes: string[];
  palletId: string;
  date?: Date;
};

const TEMPLATE_URL = "/label-template.docx";
const QR_REL_ID = "rIdLabelQr";

// Usable line width on the A4 template (page width less margins), in points
const LINE_WIDTH_PT = 552;
// Average width of a bold Arial capital as a fraction of the font size (a little generous)
const CHAR_WIDTH_EM = 0.7;
// Line height of a text line as a fraction of the font size (Arial, 1.15 line spacing)
const LINE_HEIGHT_EM = 1.32;
// Points of page height available for the content
const PAGE_HEIGHT_PT = 812;

export function formatLabelDate(date: Date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Shrinks a font (half-points) so `text` stays on one line. Never grows it. */
function fitHalfPoints(original: number, text: string) {
  const perChar = Math.max(text.length, 1) * CHAR_WIDTH_EM;
  const fitted = Math.floor((LINE_WIDTH_PT / perChar) * 2);
  return Math.max(40, Math.min(original, fitted));
}

function setFontSize(paragraph: string, from: number, to: number) {
  return paragraph
    .split(`<w:sz w:val="${from}"/>`)
    .join(`<w:sz w:val="${to}"/>`)
    .split(`<w:szCs w:val="${from}"/>`)
    .join(`<w:szCs w:val="${to}"/>`);
}

function qrRun(sizePt: number) {
  const emu = Math.round(sizePt * 12700);

  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${emu}" cy="${emu}"/>` +
    `<wp:docPr id="101" name="Pallet ID QR code"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="qr.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${QR_REL_ID}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu}" cy="${emu}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

export async function buildLabelDocx(input: LabelInput): Promise<Blob> {
  const [{ default: JSZip }, { default: QRCode }] = await Promise.all([
    import("jszip"),
    import("qrcode")
  ]);

  const item = input.item.trim().toUpperCase();
  const palletId = input.palletId.trim().toUpperCase();
  const sizes = input.sizes.map((s) => s.trim().toUpperCase()).filter(Boolean);
  const date = formatLabelDate(input.date ?? new Date());

  if (!item || !palletId || sizes.length === 0 || sizes.length > MAX_SIZES) {
    throw new Error("Item, at least one size and a pallet ID are required");
  }

  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("Could not load the label template");

  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const docFile = zip.file("word/document.xml");
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const typesFile = zip.file("[Content_Types].xml");
  if (!docFile || !relsFile || !typesFile) {
    throw new Error("The label template is not a valid .docx");
  }

  const xml = await docFile.async("string");
  const paragraphs = xml.match(/<w:p [\s\S]*?<\/w:p>/g);
  if (!paragraphs) throw new Error("The label template has no paragraphs");

  // With every size line in use there is no room for the blank spacer line
  const dropSpacer = sizes.length === MAX_SIZES;

  // Space left for the QR code, estimated from the lines above and below it
  const itemPt = fitHalfPoints(200, item) / 2;
  const sizePts = sizes.map((s) => fitHalfPoints(170, s) / 2);
  const fixedPt =
    itemPt * LINE_HEIGHT_EM +
    sizePts.reduce((sum, pt) => sum + pt * LINE_HEIGHT_EM, 0) +
    (dropSpacer ? 0 : 30 * LINE_HEIGHT_EM) +
    30 * LINE_HEIGHT_EM + // pallet ID text
    66 * LINE_HEIGHT_EM; // date
  const qrPt = Math.round(Math.max(60, Math.min(200, PAGE_HEIGHT_PT - fixedPt - 24)));

  let sizeIndex = 0;
  let sawQr = false;

  const rebuilt = paragraphs.map((paragraph, index) => {
    if (paragraph.includes("{ITEM}")) {
      return setFontSize(paragraph, 200, itemPt * 2).replace("{ITEM}", () => escapeXml(item));
    }

    if (paragraph.includes("{SIZE}")) {
      const size = sizes[sizeIndex++];
      if (size === undefined) return "";
      return setFontSize(paragraph, 170, fitHalfPoints(170, size)).replace(
        /\{SIZE\} ?/,
        () => escapeXml(size)
      );
    }

    if (paragraph.includes("{QR PALLET ID}")) {
      sawQr = true;
      return paragraph.replace(/<w:r [\s\S]*<\/w:r>/, () => qrRun(qrPt));
    }

    if (paragraph.includes("{PALLET ID}")) {
      return setFontSize(paragraph, 60, fitHalfPoints(60, palletId)).replace(
        "{PALLET ID}",
        () => escapeXml(palletId)
      );
    }

    if (/\d{2}-\d{2}-\d{2}/.test(paragraph)) {
      return paragraph.replace(/\d{2}-\d{2}-\d{2}/, date);
    }

    // The empty line between the sizes and the QR code
    if (dropSpacer && !paragraph.includes("<w:t") && index > 0) {
      const before = paragraphs.slice(0, index).some((p) => p.includes("{SIZE}"));
      const after = paragraphs.slice(index + 1).some((p) => p.includes("{QR PALLET ID}"));
      if (before && after && paragraph.includes('w:jc w:val="left"')) return "";
    }

    return paragraph;
  });

  if (!sawQr) throw new Error("The label template has no {QR PALLET ID} placeholder");

  let out = xml;
  paragraphs.forEach((original, i) => {
    out = out.replace(original, () => rebuilt[i]);
  });

  const qrDataUrl = await QRCode.toDataURL(palletId, {
    margin: 1,
    width: 600,
    errorCorrectionLevel: "M"
  });

  zip.file("word/document.xml", out);
  zip.file("word/media/label-qr.png", qrDataUrl.split(",")[1], { base64: true });

  const rels = await relsFile.async("string");
  zip.file(
    "word/_rels/document.xml.rels",
    rels.replace(
      "</Relationships>",
      `<Relationship Id="${QR_REL_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/label-qr.png"/></Relationships>`
    )
  );

  const types = await typesFile.async("string");
  if (!/Extension="png"/i.test(types)) {
    zip.file(
      "[Content_Types].xml",
      types.replace(
        /(<Types[^>]*>)/,
        `$1<Default ContentType="image/png" Extension="png"/>`
      )
    );
  }

  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}
