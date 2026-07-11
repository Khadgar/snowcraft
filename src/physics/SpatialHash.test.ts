import { describe, expect, it } from 'vitest';
import { SpatialHash } from './SpatialHash';
import { circle } from './shapes';

describe('SpatialHash', () => {
  it('returns candidates in overlapping cells', () => {
    const hash = new SpatialHash(2);
    hash.insertShape(1, circle(0, 0, 0.5));
    hash.insertShape(2, circle(5, 5, 0.5));
    const near = hash.query(-1, -1, 1, 1);
    expect(near).toContain(1);
    expect(near).not.toContain(2);
  });

  it('handles negative coordinates', () => {
    const hash = new SpatialHash(1);
    hash.insertShape(7, circle(-10, -10, 0.4));
    expect(hash.query(-11, -11, -9, -9)).toContain(7);
  });

  it('clears buckets', () => {
    const hash = new SpatialHash(2);
    hash.insertShape(1, circle(0, 0, 0.5));
    hash.clear();
    expect(hash.query(-1, -1, 1, 1)).toHaveLength(0);
  });

  it('queries into a reused set', () => {
    const hash = new SpatialHash(2);
    hash.insertShape(1, circle(0, 0, 3));
    const out = new Set<number>();
    hash.queryBounds(-1, -1, 1, 1, out);
    expect(out.has(1)).toBe(true);
  });
});
