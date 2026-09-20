// Deterministic seeded PRNG (mulberry32) — used only for synthetic fallback
// data (when a real CSV isn't present) so that re-running `npm run seed`
// produces the same numbers instead of a different random dataset every time.

export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simple string -> 32-bit int hash, so each (mess, purpose) gets a stable-but-distinct seed. */
export function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

export function randRange(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min);
}

export function randInt(rand: () => number, min: number, max: number): number {
  return Math.floor(randRange(rand, min, max + 1));
}

export function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
