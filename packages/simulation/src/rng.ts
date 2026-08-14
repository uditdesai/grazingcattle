/** FNV-1a 32-bit string hash — fast, deterministic, no dependency. */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 PRNG — small, fast, good enough statistical quality for a game sim. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded random source scoped to one (farm, simHour, channel) triple.
 * Separate channels (e.g. "weather", "birth", "disease") keep independent
 * event streams stable when new random events are added later — adding a
 * disease roll doesn't shift the weather roll's sequence for existing farms.
 */
export class Rng {
  private next: () => number;

  constructor(farmSeed: string, simHour: number, channel: string) {
    const seed = hashString(`${farmSeed}|${simHour}|${channel}`);
    this.next = mulberry32(seed);
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p (0–1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Approximate normal sample via sum of uniforms — cheap, good enough for weather noise. */
  gaussian(mean = 0, stdDev = 1): number {
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += this.next();
    return mean + (sum - 3) * stdDev;
  }
}

export function rngFor(farmSeed: string, simHour: number, channel: string): Rng {
  return new Rng(farmSeed, simHour, channel);
}
