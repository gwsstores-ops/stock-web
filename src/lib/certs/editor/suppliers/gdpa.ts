import type { CertRules } from "../types";

/**
 * GDPA - "Final Inspection Report" issued by GDPA Fasteners, Jalandhar City,
 * Punjab (India).
 *
 * Unlike the other suppliers, GDPA's report is two pages: page 1 carries the
 * maker's own header, page 2 carries the dimensions table, the maker's own
 * stamp/signatures (untouched) and, at the very bottom in blank space, where
 * the reproduced-certificate wording and signature are added. The boxes
 * below were recovered the same way as YONGHI's revision - GDPA EDIT.PDF
 * pastes its white cover boxes and both GWS images as their own PDF objects
 * (form XObjects `OL2` on page 1, `OL7` on page 2), each with its own clip
 * rect and `cm` matrix chain, so the exact page-space rectangles were read
 * off by composing those matrices rather than measured by eye. Reproducing
 * GDPA SAMPLE.PDF with these rules and pixel-diffing against GDPA EDIT.PDF
 * matches to 0.02% on page 1 (antialiasing only) and exactly on page 2.
 *
 *  1. On page 1, the maker's name/address block (top left) is covered.
 *  2. On page 1, the maker's orange logo and "AN ISO 9001:2015..." lines
 *     (top right) are covered - nothing is put in their place, the "Doc:
 *     QC/QF/04 / Rev: 00 / Date: ..." box further right is the manufacturer's
 *     own and stays untouched.
 *  3. On page 1, the combined GWS logo + address image goes over the covered
 *     name/address block.
 *  4. On page 2, the "reproduced from the original test certificate" wording
 *     and Niall Crowley's signature are added below the maker's own
 *     dimensions table, stamps and signatures - all of which are left as
 *     issued, along with the UK CA / CE marks.
 *
 * Every test value, heat number and lot number on the cert is left untouched.
 */
export const gdpa: CertRules = {
  id: "GDPA",
  label: "GDPA",
  ready: true,
  reference: { width: 841.68, height: 595.2 },
  fingerprint: ["GDPA FASTENERS"],
  notes: [
    "Page 1: the maker's name/address block, top left, is covered and a combined GWS logo + address image goes in its place.",
    "Page 1: the maker's orange logo and ISO-registration lines, top right, are covered and left blank.",
    "Page 2: the 'reproduced from the original test certificate' wording and Niall Crowley's signature are added below the maker's own dimensions table and stamps.",
    "The 'Doc/Rev/Date' box, the dimensions table, the maker's own stamps and signatures, and every test value are left exactly as issued."
  ],
  scope: "all",
  steps: [
    {
      kind: "cover",
      page: 1,
      box: { x: 1.5, y: 46.96, w: 289.5, h: 99.41, from: "top" },
      note: "Maker's name and address block"
    },
    {
      kind: "cover",
      page: 1,
      box: { x: 518.42, y: 55.99, w: 116.51, h: 72.18, from: "top" },
      note: "Maker's orange logo and ISO-registration lines"
    },
    {
      kind: "stamp",
      page: 1,
      asset: "gwsHeaderBlock",
      box: { x: 41.2, y: 26.54, w: 237.67, h: 110.91, from: "top" },
      note: "GWS logo and address block"
    },
    {
      kind: "stamp",
      page: 2,
      asset: "gwsStatement",
      box: { x: 102.5, y: 0.8, w: 285.71, h: 49.94, from: "bottom" },
      note: "Reproduced-certificate wording and signature"
    }
  ]
};
