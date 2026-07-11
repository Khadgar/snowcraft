import type { Vector2 } from '../utils/Vector2';

/**
 * Reusable component data used compositionally by concrete entities
 * (design §7, §29). Entities embed these fields rather than inheriting
 * behavior.
 */

export interface Transform2D {
  position: Vector2;
  velocity: Vector2;
  /** Facing direction in radians, measured from +X counter-clockwise. */
  rotation: number;
}

export interface Health {
  health: number;
  maxHealth: number;
}
