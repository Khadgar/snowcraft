/**
 * Deterministic, seedable PRNG (mulberry32).
 *
 * A fixed seed produces a reproducible stream, which keeps the door open for
 * deterministic replays and lockstep networking (design §32) without changing
 * the simulation API.
 */
export class Random {
  private state: number;

  constructor(seed = 0x9e3779b9) {
    this.state = seed >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Returns true with the given probability in [0, 1]. */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }

  /** Unit vector components with a random direction. */
  direction(): { x: number; y: number } {
    const angle = this.range(0, Math.PI * 2);
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }
}
