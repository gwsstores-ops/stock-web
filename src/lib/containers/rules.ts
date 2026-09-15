/** Shared helpers used by every supplier's rules. */

/**
 * Clearance-hole diameter printed on a square washer mapped to the bolt size it
 * takes. Square washers are quoted by plate and hole, never by bolt, so this is
 * the only way back to a diameter the stock list will recognise.
 */
const HOLE_TO_DIAM: Record<number, number> = {
  9: 8,
  11: 10,
  13: 12,
  14: 12,
  15: 14,
  17: 16,
  18: 16,
  20: 18,
  22: 20,
  24: 22,
  26: 24,
  30: 27,
  33: 30,
  36: 33,
  39: 36
};

export const holeToDiam = (hole: number): number | null => {
  if (HOLE_TO_DIAM[hole] !== undefined) return HOLE_TO_DIAM[hole];

  // Fall back to the nearest standard size at or below the hole, which is how
  // clearance holes are cut, but the caller should still flag it for review.
  const standard = [8, 10, 12, 14, 16, 18, 20, 22, 24, 27, 30, 33, 36];
  const below = standard.filter((size) => size < hole);

  return below.length ? below[below.length - 1] : null;
};

export const isKnownHole = (hole: number) => HOLE_TO_DIAM[hole] !== undefined;

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

/** Strips a trailing `.00` so 22.00 prints as 22 in the display columns. */
export const trimNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(value);

/** The CSV writes diam_value and length_value to two decimal places. */
export const toCsvNumber = (value: number | null): string =>
  value === null ? "" : value.toFixed(2);

export const padPallet = (pallet: string): string => {
  const asNumber = Number(pallet);

  return Number.isFinite(asNumber) && /^\d+$/.test(pallet)
    ? String(asNumber).padStart(2, "0")
    : pallet;
};
