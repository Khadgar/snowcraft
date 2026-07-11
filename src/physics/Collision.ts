import { clamp } from '../utils/math';
import type { Shape } from './shapes';

/**
 * Primitive collision tests (design §17): circle, rectangle (AABB), capsule.
 * All functions are pure and operate on plain numbers so they are fast and
 * trivially unit-testable. Never uses mesh collision.
 */

/** Squared distance from point (px,py) to segment (ax,ay)-(bx,by). */
export function distSqPointSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = clamp(t, 0, 1);
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}

export function circleVsCircle(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

/** Circle (cx,cy,cr) vs axis-aligned rect centered at (rx,ry) with half-extents. */
export function circleVsRect(
  cx: number,
  cy: number,
  cr: number,
  rx: number,
  ry: number,
  hw: number,
  hh: number,
): boolean {
  const nearestX = clamp(cx, rx - hw, rx + hw);
  const nearestY = clamp(cy, ry - hh, ry + hh);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= cr * cr;
}

export function rectVsRect(
  ax: number,
  ay: number,
  ahw: number,
  ahh: number,
  bx: number,
  by: number,
  bhw: number,
  bhh: number,
): boolean {
  return (
    Math.abs(ax - bx) <= ahw + bhw && Math.abs(ay - by) <= ahh + bhh
  );
}

/** Circle vs capsule (segment (x1,y1)-(x2,y2) inflated by capsuleR). */
export function circleVsCapsule(
  cx: number,
  cy: number,
  cr: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  capsuleR: number,
): boolean {
  const r = cr + capsuleR;
  return distSqPointSegment(cx, cy, x1, y1, x2, y2) <= r * r;
}

/** Broad, symmetric intersection test between any two shapes. */
export function intersects(a: Shape, b: Shape): boolean {
  if (a.kind === 'circle' && b.kind === 'circle') {
    return circleVsCircle(a.x, a.y, a.radius, b.x, b.y, b.radius);
  }
  if (a.kind === 'circle' && b.kind === 'rect') {
    return circleVsRect(a.x, a.y, a.radius, b.x, b.y, b.halfW, b.halfH);
  }
  if (a.kind === 'rect' && b.kind === 'circle') {
    return circleVsRect(b.x, b.y, b.radius, a.x, a.y, a.halfW, a.halfH);
  }
  if (a.kind === 'rect' && b.kind === 'rect') {
    return rectVsRect(a.x, a.y, a.halfW, a.halfH, b.x, b.y, b.halfW, b.halfH);
  }
  if (a.kind === 'circle' && b.kind === 'capsule') {
    return circleVsCapsule(a.x, a.y, a.radius, b.x1, b.y1, b.x2, b.y2, b.radius);
  }
  if (a.kind === 'capsule' && b.kind === 'circle') {
    return circleVsCapsule(b.x, b.y, b.radius, a.x1, a.y1, a.x2, a.y2, a.radius);
  }
  // Remaining capsule combinations approximate the capsule by its segment
  // midpoint circle; sufficient for the current obstacle set (circles/rects).
  if (a.kind === 'capsule') {
    const mx = (a.x1 + a.x2) / 2;
    const my = (a.y1 + a.y2) / 2;
    return intersects({ kind: 'circle', x: mx, y: my, radius: a.radius }, b);
  }
  if (b.kind === 'capsule') {
    const mx = (b.x1 + b.x2) / 2;
    const my = (b.y1 + b.y2) / 2;
    return intersects(a, { kind: 'circle', x: mx, y: my, radius: b.radius });
  }
  return false;
}

export function pointInShape(shape: Shape, x: number, y: number): boolean {
  switch (shape.kind) {
    case 'circle': {
      const dx = x - shape.x;
      const dy = y - shape.y;
      return dx * dx + dy * dy <= shape.radius * shape.radius;
    }
    case 'rect':
      return Math.abs(x - shape.x) <= shape.halfW && Math.abs(y - shape.y) <= shape.halfH;
    case 'capsule':
      return distSqPointSegment(x, y, shape.x1, shape.y1, shape.x2, shape.y2) <=
        shape.radius * shape.radius;
  }
}

export function segmentVsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  cr: number,
): boolean {
  return distSqPointSegment(cx, cy, x1, y1, x2, y2) <= cr * cr;
}

/** Segment vs axis-aligned rect using the Liang-Barsky clipping algorithm. */
export function segmentVsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  hw: number,
  hh: number,
): boolean {
  const minX = rx - hw;
  const maxX = rx + hw;
  const minY = ry - hh;
  const maxY = ry + hh;
  // Trivial accept if either endpoint is inside.
  if (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY) return true;
  if (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY) return true;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];
  let u1 = 0;
  let u2 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false; // parallel and outside
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > u2) return false;
        if (t > u1) u1 = t;
      } else {
        if (t < u1) return false;
        if (t < u2) u2 = t;
      }
    }
  }
  return u1 <= u2;
}

/** Does the segment intersect the shape? Used for line of sight and fast paths. */
export function segmentVsShape(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  shape: Shape,
): boolean {
  switch (shape.kind) {
    case 'circle':
      return segmentVsCircle(x1, y1, x2, y2, shape.x, shape.y, shape.radius);
    case 'rect':
      return segmentVsRect(x1, y1, x2, y2, shape.x, shape.y, shape.halfW, shape.halfH);
    case 'capsule': {
      // Inflate the segment test by the capsule radius via closest approach.
      const r = shape.radius;
      // Sample-free approximation: treat as circle at each end + segment core.
      return (
        segmentVsCircle(x1, y1, x2, y2, shape.x1, shape.y1, r) ||
        segmentVsCircle(x1, y1, x2, y2, shape.x2, shape.y2, r) ||
        distSqPointSegment((shape.x1 + shape.x2) / 2, (shape.y1 + shape.y2) / 2, x1, y1, x2, y2) <=
          r * r
      );
    }
  }
}

export interface Pushout {
  x: number;
  y: number;
  pushed: boolean;
}

/**
 * Ejects a circle (cx,cy,cr) out of a solid shape, returning the corrected
 * center. Supports circle and rect obstacles (the movement-relevant set);
 * capsules are treated as their bounding circle.
 */
export function pushCircleOutOfShape(
  cx: number,
  cy: number,
  cr: number,
  shape: Shape,
): Pushout {
  switch (shape.kind) {
    case 'circle':
      return pushCircleOutOfCircle(cx, cy, cr, shape.x, shape.y, shape.radius);
    case 'rect':
      return pushCircleOutOfRect(cx, cy, cr, shape.x, shape.y, shape.halfW, shape.halfH);
    case 'capsule': {
      const mx = (shape.x1 + shape.x2) / 2;
      const my = (shape.y1 + shape.y2) / 2;
      return pushCircleOutOfCircle(cx, cy, cr, mx, my, shape.radius);
    }
  }
}

function pushCircleOutOfCircle(
  cx: number,
  cy: number,
  cr: number,
  ox: number,
  oy: number,
  or: number,
): Pushout {
  const dx = cx - ox;
  const dy = cy - oy;
  const minDist = cr + or;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) return { x: cx, y: cy, pushed: false };
  const dist = Math.sqrt(distSq);
  if (dist < 1e-6) {
    return { x: ox + minDist, y: oy, pushed: true };
  }
  const s = minDist / dist;
  return { x: ox + dx * s, y: oy + dy * s, pushed: true };
}

function pushCircleOutOfRect(
  cx: number,
  cy: number,
  cr: number,
  rx: number,
  ry: number,
  hw: number,
  hh: number,
): Pushout {
  const dx = cx - rx;
  const dy = cy - ry;
  const insideX = Math.abs(dx) <= hw;
  const insideY = Math.abs(dy) <= hh;

  if (insideX && insideY) {
    // Center inside the rect: eject along the axis of least penetration.
    const penX = hw + cr - Math.abs(dx);
    const penY = hh + cr - Math.abs(dy);
    if (penX < penY) {
      const sign = dx >= 0 ? 1 : -1;
      return { x: rx + sign * (hw + cr), y: cy, pushed: true };
    }
    const sign = dy >= 0 ? 1 : -1;
    return { x: cx, y: ry + sign * (hh + cr), pushed: true };
  }

  const nearestX = clamp(cx, rx - hw, rx + hw);
  const nearestY = clamp(cy, ry - hh, ry + hh);
  const ex = cx - nearestX;
  const ey = cy - nearestY;
  const distSq = ex * ex + ey * ey;
  if (distSq >= cr * cr) return { x: cx, y: cy, pushed: false };
  const dist = Math.sqrt(distSq);
  if (dist < 1e-6) return { x: cx, y: cy, pushed: false };
  const s = cr / dist;
  return { x: nearestX + ex * s, y: nearestY + ey * s, pushed: true };
}
