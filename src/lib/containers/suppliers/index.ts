import type { SupplierRules } from "../types";
import { gdpa } from "./gdpa";
import { longThread } from "./longThread";

/**
 * A supplier whose packing list we have not seen yet. It still appears in the
 * picker so the tool lists every supplier we buy from, but choosing it explains
 * what is needed rather than producing a half-guessed CSV.
 */
const pending = (id: string, label: string): SupplierRules => ({
  id,
  label,
  ready: false,
  notes: [
    "No rules written yet. Send a packing list PDF and a matching CSV and the rules for this supplier can be added."
  ],
  parse: () => []
});

export const SUPPLIERS: SupplierRules[] = [
  gdpa,
  longThread,
  pending("NINGBO_JINDING", "NINGBO JINDING"),
  pending("YONGHI", "YONGHI")
];

export const findSupplier = (id: string) =>
  SUPPLIERS.find((supplier) => supplier.id === id) ?? null;
