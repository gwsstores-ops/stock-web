import type { CertRules } from "../types";

/**
 * YONGHI - "QUALITY CERTIFICATE EN 10204 3.1" issued by Jiangsu Yongyi
 * Fastener Co., Ltd (江苏甬怡紧固件有限公司).
 *
 * The boxes below were measured off YONGHI EDITED.pdf in `certs templates`,
 * which is YONGHI SAMPLE.pdf after the edit was done by hand. The header is
 * one centred block - the maker's Chinese name, English name and "Quality
 * Certificate" title stacked on three lines - with the CE mark to its left
 * and the CNAS/ilac-MRA mark off to the right, both the manufacturer's own
 * and left untouched.
 *
 *  1. The three-line maker name/title block is covered.
 *  2. A GWS header image goes in its place - note this is a different image
 *     to the one HAMIDI uses (`gwsLogo`/`gwsAddress`): here the logo and the
 *     address block are already combined into one image, exactly as it was
 *     pasted into the sample, so it is stamped as a single block rather than
 *     two.
 *  3. The "reproduced from the original test certificate" wording and Niall
 *     Crowley's signature go in the empty space at the bottom left, clear of
 *     the maker's own signature line and red stamp on the right.
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
    "The maker's name and 'Quality Certificate' title, top centre, are covered.",
    "A combined GWS logo + address image goes in their place.",
    "The 'reproduced from the original test certificate' wording and Niall Crowley's signature are added at the bottom left.",
    "The CE mark, the CNAS/ilac-MRA mark and every test value are left exactly as issued."
  ],
  scope: "all",
  steps: [
    {
      kind: "cover",
      box: { x: 304, y: 48, w: 168, h: 42, from: "top" },
      note: "Maker's name and 'Quality Certificate' title"
    },
    {
      kind: "stamp",
      asset: "gwsHeaderBlock",
      box: { x: 283.68, y: 0, w: 206.88, h: 92.16, from: "top" },
      note: "GWS logo and address block"
    },
    {
      kind: "stamp",
      asset: "gwsStatement",
      box: { x: 55.2, y: 61.2, w: 279.6, h: 39.36, from: "bottom" },
      note: "Reproduced-certificate wording and signature"
    }
  ]
};
