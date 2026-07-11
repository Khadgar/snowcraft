/**
 * Collision primitive shapes (design §17). Shapes store absolute world
 * coordinates as plain numbers to stay allocation-free and trivially testable.
 * Intersection tests live in `physics/Collision.ts`.
 */

export interface CircleShape {
  readonly kind: 'circle';
  x: number;
  y: number;
  radius: number;
}

/** Axis-aligned rectangle centered at (x, y). */
export interface RectShape {
  readonly kind: 'rect';
  x: number;
  y: number;
  halfW: number;
  halfH: number;
}

/** Capsule: a line segment (x1,y1)-(x2,y2) expanded by `radius`. */
export interface CapsuleShape {
  readonly kind: 'capsule';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  radius: number;
}

export type Shape = CircleShape | RectShape | CapsuleShape;

export function circle(x: number, y: number, radius: number): CircleShape {
  return { kind: 'circle', x, y, radius };
}

export function rect(x: number, y: number, halfW: number, halfH: number): RectShape {
  return { kind: 'rect', x, y, halfW, halfH };
}

export function capsule(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
): CapsuleShape {
  return { kind: 'capsule', x1, y1, x2, y2, radius };
}

/** Axis-aligned bounds of a shape, useful for broadphase insertion. */
export function shapeBounds(shape: Shape): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  switch (shape.kind) {
    case 'circle':
      return {
        minX: shape.x - shape.radius,
        minY: shape.y - shape.radius,
        maxX: shape.x + shape.radius,
        maxY: shape.y + shape.radius,
      };
    case 'rect':
      return {
        minX: shape.x - shape.halfW,
        minY: shape.y - shape.halfH,
        maxX: shape.x + shape.halfW,
        maxY: shape.y + shape.halfH,
      };
    case 'capsule':
      return {
        minX: Math.min(shape.x1, shape.x2) - shape.radius,
        minY: Math.min(shape.y1, shape.y2) - shape.radius,
        maxX: Math.max(shape.x1, shape.x2) + shape.radius,
        maxY: Math.max(shape.y1, shape.y2) + shape.radius,
      };
  }
}
