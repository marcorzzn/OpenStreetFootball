/**
 * Deterministic Pseudo-Random Number Generator (Mulberry32)
 * Used across all physics and gameplay logic so simulations are reproducible
 * from a shared match seed and independent of wall-clock time.
 */
export class SeededRNG {
  private state: number;
  private initialSeed: number;

  constructor(seed: number = 1337) {
    this.initialSeed = seed >>> 0;
    this.state = this.initialSeed;
  }

  /**
   * Resets the generator with a new 32-bit integer seed.
   */
  public reset(seed: number): void {
    this.initialSeed = seed >>> 0;
    this.state = this.initialSeed;
  }

  /**
   * Returns the seed used to initialize the current stream.
   */
  public getSeed(): number {
    return this.initialSeed;
  }

  /**
   * Generates a deterministic float in [0, 1) using Mulberry32.
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a deterministic float in [a, b).
   */
  public range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

/**
 * Generates a fresh 32-bit unsigned seed for a new match.
 */
export function generateMatchSeed(): number {
  return ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 1;
}
