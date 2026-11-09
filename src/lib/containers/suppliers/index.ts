import type { SupplierRules } from "../types";
import { gdpa } from "./gdpa";
import { hamidi } from "./hamidi";
import { longThread } from "./longThread";
import { ningboJinding } from "./ningboJinding";
import { yonghi } from "./yonghi";

export const SUPPLIERS: SupplierRules[] = [
  gdpa,
  hamidi,
  longThread,
  yonghi,
  ningboJinding
];

export const findSupplier = (id: string) =>
  SUPPLIERS.find((supplier) => supplier.id === id) ?? null;
