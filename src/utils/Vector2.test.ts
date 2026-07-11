import { describe, expect, it } from 'vitest';
import { Vector2 } from './Vector2';

describe('Vector2', () => {
  it('adds and scales in place', () => {
    const v = new Vector2(1, 2).add(new Vector2(3, 4)).scale(2);
    expect(v.x).toBe(8);
    expect(v.y).toBe(12);
  });

  it('normalizes to unit length', () => {
    const v = new Vector2(3, 4).normalize();
    expect(v.length()).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(0.8);
  });

  it('leaves a zero vector unchanged when normalized', () => {
    const v = new Vector2(0, 0).normalize();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('clamps magnitude', () => {
    const v = new Vector2(10, 0).clampLength(4);
    expect(v.length()).toBeCloseTo(4);
  });

  it('computes distance', () => {
    expect(Vector2.distance(new Vector2(0, 0), new Vector2(3, 4))).toBe(5);
  });

  it('rotates by 90 degrees', () => {
    const v = new Vector2(1, 0).rotate(Math.PI / 2);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });
});
