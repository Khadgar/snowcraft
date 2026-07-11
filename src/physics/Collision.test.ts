import { describe, expect, it } from 'vitest';
import {
  circleVsCircle,
  circleVsRect,
  intersects,
  pointInShape,
  pushCircleOutOfShape,
  segmentVsShape,
} from './Collision';
import { circle, rect } from './shapes';

describe('collision primitives', () => {
  it('detects circle vs circle overlap', () => {
    expect(circleVsCircle(0, 0, 1, 1.5, 0, 1)).toBe(true);
    expect(circleVsCircle(0, 0, 1, 3, 0, 1)).toBe(false);
  });

  it('detects circle vs rect overlap', () => {
    expect(circleVsRect(2, 0, 0.6, 0, 0, 1.5, 1.5)).toBe(true);
    expect(circleVsRect(3, 0, 0.4, 0, 0, 1, 1)).toBe(false);
  });

  it('dispatches intersects by shape kind', () => {
    expect(intersects(circle(0, 0, 1), rect(1, 0, 1, 1))).toBe(true);
    expect(intersects(circle(10, 10, 1), rect(0, 0, 1, 1))).toBe(false);
  });

  it('tests point containment', () => {
    expect(pointInShape(circle(0, 0, 1), 0.5, 0)).toBe(true);
    expect(pointInShape(rect(0, 0, 1, 1), 2, 2)).toBe(false);
  });

  it('tests segment vs shape (line of sight)', () => {
    // Segment passing through a circle at the origin is blocked.
    expect(segmentVsShape(-5, 0, 5, 0, circle(0, 0, 1))).toBe(true);
    // Segment well above the circle is clear.
    expect(segmentVsShape(-5, 5, 5, 5, circle(0, 0, 1))).toBe(false);
  });

  it('pushes a circle out of a circle obstacle', () => {
    const r = pushCircleOutOfShape(0.5, 0, 0.5, circle(0, 0, 1));
    expect(r.pushed).toBe(true);
    const dist = Math.hypot(r.x - 0, r.y - 0);
    expect(dist).toBeCloseTo(1.5); // cr + or
  });

  it('pushes a circle out of a rect obstacle', () => {
    const r = pushCircleOutOfShape(1.4, 0, 0.5, rect(0, 0, 1, 1));
    expect(r.pushed).toBe(true);
    expect(r.x).toBeGreaterThanOrEqual(1.5 - 1e-6); // outside right face + radius
  });

  it('does not push when clear', () => {
    const r = pushCircleOutOfShape(5, 5, 0.5, circle(0, 0, 1));
    expect(r.pushed).toBe(false);
  });
});
