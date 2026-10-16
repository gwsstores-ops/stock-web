import type { CertRules } from "../types";
import { gdpa } from "./gdpa";
import { hamidi } from "./hamidi";
import { yonghi } from "./yonghi";

export const CERT_SUPPLIERS: CertRules[] = [
  hamidi,
  yonghi,
  gdpa
];

export const findCertSupplier = (id: string) =>
  CERT_SUPPLIERS.find((supplier) => supplier.id === id) ?? null;
