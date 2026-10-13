// Seeded, serializable random numbers (mulberry32). The generator state lives in the
// game state (`holder.rng`), so a saved game resumes the exact same sequence.

export interface RngHolder {
  rng: number;
}

/** Turns any integer seed into a well-mixed 32-bit generator state. */
export function seedToState(seed: number): number {
  let x = (seed | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

export class Rng {
  private readonly holder: RngHolder;

  constructor(holder: RngHolder) {
    this.holder = holder;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    this.holder.rng = (this.holder.rng + 0x6d2b79f5) >>> 0;
    let t = this.holder.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.float() < probability;
  }

  /** Picks one entry by weight. Entries with weight 0 are never picked. */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    let sum = 0;
    for (const [, w] of entries) sum += w;
    if (!(sum > 0)) throw new Error('weighted(): total weight must be positive');
    let roll = this.float() * sum;
    let last: T | undefined;
    for (const [value, w] of entries) {
      if (w <= 0) continue;
      last = value;
      roll -= w;
      if (roll < 0) return value;
    }
    return last as T;
  }
}
