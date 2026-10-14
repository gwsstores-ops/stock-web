import type { CertRules } from "../types";

/**
 * HAMIDI - "CERTIFICATE OF INSPECTION (EN10204 3.1)" issued by Akal Purkh
 * Mechanical Works, Ludhiana.
 *
 * The boxes below were measured off HAMIDI EDITED.pdf in `certs templates`,
 * which is HAMIDI SAMPLE.pdf after the edit was done by hand. The header table
 * has three cells across the top: the maker's logo on the left, the approval
 * marks (CE / TUV / NABCB) in the middle, and the maker's name and address on
 * the right. Only the outer two cells change - the approval marks are the
 * manufacturer's and stay exactly as they are.
 *
 *  1. The maker's logo cell is covered and the GWS logo goes in its place.
 *  2. The maker's name and address cell is covered and the GWS address block
 *     goes in its place.
 *  3. A stray rule to the right of the NABCB mark is covered - it is left over
 *     from the maker's own artwork and looks like a smudge once the rest of the
 *     header is GWS.
 *  4. The "reproduced from the original test certificate" wording and Niall
 *     Crowley's signature go in the empty space at the bottom left, clear of
 *     the maker's own "Quality Manager" line on the right.
 *
 * Every test value, heat number and lot number on the cert is left untouched.
 */
export const hamidi: CertRules = {
  id: "HAMIDI",
  label: "HAMIDI",
  ready: true,
  reference: { width: 612, height: 792 },
  fingerprint: ["AKAL PURKH MECHANICAL WORKS", "CERTIFICATE OF INSPECTION"],
  notes: [
    "The maker's logo, top left, is replaced with the GWS logo.",
    "The maker's name and address, top right, is replaced with the GWS address block.",
    "The leftover rule beside the NABCB mark is cleaned off.",
    "The 'reproduced from the original test certificate' wording and Niall Crowley's signature are added at the bottom left.",
    "The CE, TUV and NABCB marks and every test value are left exactly as issued."
  ],
  scope: "all",
  steps: [
    {
      kind: "cover",
      box: { x: 76.3, y: 36.1, w: 111.0, h: 44.5, from: "top" },
      note: "Maker's logo cell"
    },
    {
      kind: "cover",
      box: { x: 355.4, y: 34.9, w: 181.9, h: 48.5, from: "top" },
      note: "Maker's name and address cell"
    },
    {
      kind: "cover",
      box: { x: 335.7, y: 40.2, w: 12.6, h: 42.2, from: "top" },
      note: "Leftover rule beside the NABCB mark"
    },
    {
      kind: "stamp",
      asset: "gwsLogo",
      box: { x: 94.0, y: 39.6, w: 71.5, h: 40.4, from: "top" },
      note: "GWS logo"
    },
    {
      kind: "stamp",
      asset: "gwsAddress",
      box: { x: 356.1, y: 44.6, w: 177.0, h: 31.4, from: "top" },
      note: "GWS name and address"
    },
    {
      kind: "stamp",
      asset: "gwsStatement",
      box: { x: 65.1, y: 30.0, w: 296.6, h: 51.9, from: "bottom" },
      // The hand-edited sample has this block pasted a touch off square. It
      // reads as a stamp applied by hand, so it is kept; set it to 0 to
      // straighten it.
      rotate: 0.573,
      note: "Reproduced-certificate wording and signature"
    }
  ]
};
