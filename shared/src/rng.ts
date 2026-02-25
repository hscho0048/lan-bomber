// Deterministic RNG utilities.
// We keep this tiny to avoid external dependencies.

export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  private nextFn: () => number;
  public readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.nextFn = mulberry32(this.seed);
  }

  next(): number {
    return this.nextFn();
  }

  int(minInclusive: number, maxInclusive: number): number {
    const r = this.next();
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(r * span);
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
}

export function seedFromString(str: string): number {
  return xmur3(str)();
}
