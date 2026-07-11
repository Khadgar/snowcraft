/**
 * Mutable 2D vector used for all gameplay-space math (design §5).
 *
 * Methods mutate in place and return `this` for chaining to avoid per-frame
 * allocations (design §26). Use {@link Vec2Pool} for scratch vectors.
 */
export class Vector2 {
  constructor(
    public x = 0,
    public y = 0,
  ) {}

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v: Readonly<Vector2>): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  add(v: Readonly<Vector2>): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  addScaled(v: Readonly<Vector2>, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    return this;
  }

  sub(v: Readonly<Vector2>): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  negate(): this {
    this.x = -this.x;
    this.y = -this.y;
    return this;
  }

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  /** Normalizes in place. A zero vector is left unchanged. */
  normalize(): this {
    const len = this.length();
    if (len > 1e-9) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  /** Clamps the magnitude to `max`, preserving direction. */
  clampLength(max: number): this {
    const lenSq = this.lengthSq();
    if (lenSq > max * max) {
      this.normalize().scale(max);
    }
    return this;
  }

  dot(v: Readonly<Vector2>): number {
    return this.x * v.x + this.y * v.y;
  }

  /** 2D cross product magnitude (z-component of the 3D cross). */
  cross(v: Readonly<Vector2>): number {
    return this.x * v.y - this.y * v.x;
  }

  distanceTo(v: Readonly<Vector2>): number {
    return Math.hypot(this.x - v.x, this.y - v.y);
  }

  distanceToSq(v: Readonly<Vector2>): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  /** Angle in radians measured from +X, counter-clockwise. */
  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  /** Rotates in place by `radians`. */
  rotate(radians: number): this {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const x = this.x * cos - this.y * sin;
    const y = this.x * sin + this.y * cos;
    this.x = x;
    this.y = y;
    return this;
  }

  /** Linearly interpolates toward `v` by `t` in [0, 1]. */
  lerp(v: Readonly<Vector2>, t: number): this {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    return this;
  }

  equals(v: Readonly<Vector2>, epsilon = 1e-6): boolean {
    return Math.abs(this.x - v.x) <= epsilon && Math.abs(this.y - v.y) <= epsilon;
  }

  static distance(a: Readonly<Vector2>, b: Readonly<Vector2>): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  static distanceSq(a: Readonly<Vector2>, b: Readonly<Vector2>): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }
}
