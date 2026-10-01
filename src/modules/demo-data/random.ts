/**
 * Deterministic pseudo-randomness for the demo dataset: the same key always
 * draws the same number, on every machine and every run, so a demo scan is
 * reproducible down to the last video (Brief §62: realistic, but fixed).
 * Nothing here is used for anything security-related.
 */

/** FNV-1a, 32-bit. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** One draw in [0, 1) for the given key — a single mulberry32 step seeded
 *  from the key's hash. */
export function draw(...key: (string | number)[]): number {
  let t = (hashString(key.join("|")) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Picks one entry by weight, using a draw in [0, 1). */
export function pickWeighted<T>(entries: readonly (readonly [T, number])[], roll: number): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let threshold = roll * total;
  for (const [value, weight] of entries) {
    if (threshold < weight) return value;
    threshold -= weight;
  }
  return entries[entries.length - 1][0];
}
