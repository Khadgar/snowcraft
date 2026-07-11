import { shapeBounds, type Shape } from './shapes';

/**
 * Uniform spatial hash grid for broadphase collision queries (design §17).
 * Entities are inserted by their axis-aligned bounds into every overlapped
 * cell; queries return candidate ids to be confirmed by narrowphase tests.
 */
export class SpatialHash {
  private readonly cells = new Map<number, number[]>();

  constructor(private readonly cellSize: number) {}

  clear(): void {
    this.cells.clear();
  }

  private key(cx: number, cy: number): number {
    // Pack signed cell coords into a single number (supports ±32k cells).
    return (cx + 0x8000) * 0x10000 + (cy + 0x8000);
  }

  insertBounds(id: number, minX: number, minY: number, maxX: number, maxY: number): void {
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs);
    const y0 = Math.floor(minY / cs);
    const x1 = Math.floor(maxX / cs);
    const y1 = Math.floor(maxY / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) {
          bucket = [];
          this.cells.set(k, bucket);
        }
        bucket.push(id);
      }
    }
  }

  insertShape(id: number, shape: Shape): void {
    const b = shapeBounds(shape);
    this.insertBounds(id, b.minX, b.minY, b.maxX, b.maxY);
  }

  /** Collects candidate ids overlapping the bounds into `out` (reused Set). */
  queryBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    out: Set<number>,
  ): void {
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs);
    const y0 = Math.floor(minY / cs);
    const x1 = Math.floor(maxX / cs);
    const y1 = Math.floor(maxY / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const id of bucket) out.add(id);
      }
    }
  }

  /** Convenience query returning a fresh array (prefer queryBounds in hot paths). */
  query(minX: number, minY: number, maxX: number, maxY: number): number[] {
    const set = new Set<number>();
    this.queryBounds(minX, minY, maxX, maxY, set);
    return [...set];
  }
}
