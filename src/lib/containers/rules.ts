/** Shared helpers used by every supplier's rules. */

/** Maps a finish phrase anywhere in a description to the stock list's suffix. */
export const finishSuffix = (description: string): string | null => {
  const upper = description.toUpperCase();

  if (/HOT\s*DIP\s*GALV/.test(upper)) return "HDG";
  if (/SPUN\s*GALV/.test(upper)) return "SPUN";
  if (/ELECTRO\s*ZINC|ZINC\s*PLATED|\bZP\b/.test(upper)) return "ZP";
  if (/STAINLESS|\bA2\b|\bA4\b|\bSS\b/.test(upper)) return "SS";
  if (/SELF\s*COLOU?R|\bPLAIN\b|BLACK\s*FINISH/.test(upper)) return "SC";

  return null;
};

/** The CSV writes diam_value and length_value as plain numbers, no padding. */
export const toCsvNumber = (value: number | null): string =>
  value === null ? "" : String(value);

export const padPallet = (pallet: string): string => {
  const asNumber = Number(pallet);

  return Number.isFinite(asNumber) && /^\d+$/.test(pallet)
    ? String(asNumber).padStart(2, "0")
    : pallet;
};
