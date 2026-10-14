import type { CertRules } from "../types";
import { hamidi } from "./hamidi";

/**
 * A supplier whose cert we have not seen yet. It still appears in the picker so
 * the tool lists every supplier we take certs from, but choosing it explains
 * what is needed rather than stamping a layout that was never measured.
 */
const pending = (id: string, label: string): CertRules => ({
  id,
  label,
  ready: false,
  reference: { width: 612, height: 792 },
  fingerprint: [],
  notes: [
    "No rules written yet. Put an original cert and the edited version of it in the 'certs templates' folder and the rules for this supplier can be added."
  ],
  scope: "all",
  steps: []
});

export const CERT_SUPPLIERS: CertRules[] = [
  hamidi,
  pending("GDPA", "GDPA"),
  pending("LONG_THREAD", "LONG THREAD"),
  pending("YONGHI", "YONGHI")
];

export const findCertSupplier = (id: string) =>
  CERT_SUPPLIERS.find((supplier) => supplier.id === id) ?? null;
