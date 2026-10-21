import type { CertRules } from "../types";

/**
 * DEEPAK - "INSPECTION CERTIFICATE" issued by Deepak Fasteners Limited,
 * Doraha, Ludhiana (India).
 *
 * Measured the same way as YONGHI's revision and GDPA - DEEPAK EDITED.pdf in
 * `SUPPLIER TEMPLATES` pastes its white cover boxes (`OL4`) and the GWS
 * images (`OL5`) as their own form XObjects, so each page-space rectangle
 * was read off their `cm` matrices rather than measured by eye.
 *
 * The header is a single row: the maker's logo, name and address on the left,
 * the "INSPECTION CERTIFICATE" title with the Customer / P.O. / Invoice /
 * Description boxes in the middle, and the Intertek mark with "Page 1 of 1"
 * on the right.
 *
 *  1. The maker's logo, name and address cell (top left) is covered and the
 *     plain GWS wordmark (`gwsWordmark` - not the globe logo HAMIDI uses)
 *     goes in its place.
 *  2. The Intertek mark and "Page 1 of 1" (top right) are covered and the GWS
 *     address block goes in their place. The "Certification in Accordance
 *     with EN-10204, Type 3.1." line below is left as issued.
 *  3. The "Customer Name: Deepak Fasteners Ltd. (UK)" row is covered and left
 *     blank - the P.O., invoice, certificate number and description stay.
 *  4. The "reproduced from the original test certificate" wording and Niall
 *     Crowley's signature go in the blank space below the footer note.
 *
 * Every test value, heat number and lot number on the cert is left untouched.
 */
export const deepak: CertRules = {
  id: "DEEPAK",
  label: "DEEPAK",
  ready: true,
  reference: { width: 792, height: 612 },
  fingerprint: ["DEEPAK FASTENERS"],
  notes: [
    "The maker's logo, name and address, top left, are replaced with the GWS wordmark.",
    "The Intertek mark and page number, top right, are replaced with the GWS address block.",
    "The 'Customer Name' row is covered and left blank.",
    "The 'reproduced from the original test certificate' wording and Niall Crowley's signature are added at the bottom left.",
    "The CE mark, the maker's own signatures and every test value are left exactly as issued."
  ],
  scope: "all",
  steps: [
    {
      kind: "cover",
      box: { x: 25.78, y: 74.57, w: 226.02, h: 61.35, from: "top" },
      note: "Maker's logo, name and address"
    },
    {
      kind: "cover",
      box: { x: 581.69, y: 74.2, w: 159.43, h: 44.82, from: "top" },
      note: "Intertek mark and page number"
    },
    {
      kind: "cover",
      box: { x: 246.67, y: 88.9, w: 349.73, h: 15.43, from: "top" },
      note: "Customer Name row"
    },
    {
      kind: "stamp",
      asset: "gwsWordmark",
      box: { x: 74.2, y: 78.24, w: 95.5, h: 54.57, from: "top" },
      note: "GWS wordmark"
    },
    {
      kind: "stamp",
      asset: "gwsAddress",
      box: { x: 581.03, y: 85.59, w: 154.41, h: 27.37, from: "top" },
      note: "GWS name and address"
    },
    {
      kind: "stamp",
      asset: "gwsStatement",
      box: { x: 23.01, y: 45.13, w: 319.49, h: 55.89, from: "bottom" },
      note: "Reproduced-certificate wording and signature"
    }
  ]
};
