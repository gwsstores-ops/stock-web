import type { CertRules } from "../types";

/**
 * YONGHI - "QUALITY CERTIFICATE EN 10204 3.1" issued by Jiangsu Yongyi
 * Fastener Co., Ltd (江苏甬怡紧固件有限公司).
 *
 * Revised from a second sample/edited pair in `certs templates` (the first
 * attempt's layout wasn't liked). This time the boxes were not eyeballed off
 * a pixel diff - the hand edit in YONGHI SAMPLE.pdf pastes its white cover
 * box and both GWS images as their own PDF objects (form XObjects `OL4`/
 * `OL5`), each with its own clip rect and `cm` matrix chain, so the exact
 * page-space rectangles were recovered by composing those matrices
 * (`0.750071/0.749597` then `0.24` scale, then each image's own placement
 * matrix) rather than measured by eye. Reproducing the original and
 * pixel-diffing it against the hand-edited sample matches to 0.006%
 * (antialiasing only) - tighter than HAMIDI's 0.05%.
 *
 * The header is one centred block - the maker's Chinese name, English name
 * and "Quality Certificate" title stacked on three lines - with the CE mark
 * to its left and the CNAS/ilac-MRA mark off to the right, both the
 * manufacturer's own and left untouched.
 *
 *  1. A wide white box clears the top of the page from the left margin
 *     through to just short of the CNAS/ilac-MRA mark, well clear of the
 *     three-line maker name/title block it hides - the box is sized to the
 *     sample's own cover paste, not just a tight crop around the text.
 *  2. The same combined GWS logo + address image as before (`gwsHeaderBlock`)
 *     goes top left, in the blank margin rather than over the covered text -
 *     this revision moved and resized it relative to the first attempt.
 *  3. The "reproduced from the original test certificate" wording and Niall
 *     Crowley's signature (`gwsStatement`) go bottom left, clear of the
 *     maker's own signature line and red stamp on the right - also resized
 *     from the first attempt.
 *
 * Every test value, heat number and lot number on the cert is left untouched.
 */
export const yonghi: CertRules = {
  id: "YONGHI",
  label: "YONGHI",
  ready: true,
  reference: { width: 841.92, height: 595.32 },
  fingerprint: ["YONGYI FASTENER"],
  notes: [
    "The maker's name and 'Quality Certificate' title, top centre, are covered by a wide white box.",
    "A combined GWS logo + address image goes top left.",
    "The 'reproduced from the original test certificate' wording and Niall Crowley's signature are added at the bottom left.",
    "The CE mark, the CNAS/ilac-MRA mark and every test value are left exactly as issued."
  ],
  scope: "all",
  steps: [
    {
      kind: "cover",
      box: { x: 256.65, y: 0.32, w: 420.49, h: 70.70, from: "top" },
      note: "Maker's name and 'Quality Certificate' title"
    },
    {
      kind: "stamp",
      asset: "gwsHeaderBlock",
      box: { x: 22.54, y: 14.08, w: 165.27, h: 77.13, from: "top" },
      note: "GWS logo and address block"
    },
    {
      kind: "stamp",
      asset: "gwsStatement",
      box: { x: 37.74, y: 35.31, w: 358.97, h: 62.75, from: "bottom" },
      note: "Reproduced-certificate wording and signature"
    }
  ]
};
