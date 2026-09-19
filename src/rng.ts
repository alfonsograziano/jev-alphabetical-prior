/**
 * A seeded PRNG, so every shuffle in the design is reproducible.
 *
 * The whole experiment turns on insertion order being independent of
 * alphabetical order. That independence has to be auditable by anyone re-running
 * this, which means the shuffles cannot come from Math.random.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, returning a new array. */
export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Draw `count` items without replacement. */
export function sample<T>(items: readonly T[], count: number, rand: () => number): T[] {
  return shuffle(items, rand).slice(0, count);
}
