import type { CertRules } from "../types";
import { deepak } from "./deepak";
import { gdpa } from "./gdpa";
import { hamidi } from "./hamidi";
import { yonghi } from "./yonghi";

export const CERT_SUPPLIERS: CertRules[] = [
  hamidi,
  yonghi,
  gdpa,
  deepak
];

export const findCertSupplier = (id: string) =>
  CERT_SUPPLIERS.find((supplier) => supplier.id === id) ?? null;
