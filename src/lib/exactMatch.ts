/**
 * Escapes `%`, `_` and `\` so a value can be used as a literal in an ILIKE
 * pattern. Pallet IDs such as `DP290826_I` contain `_`, which ILIKE otherwise
 * treats as "any single character".
 */
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * ILIKE pattern that matches `value` exactly, ignoring case. Use this instead
 * of `${value}%` when mutating rows: a prefix match on `E3` also hits `E35`.
 */
export function exactIlike(value: string) {
  return escapeLike(value.trim());
}
