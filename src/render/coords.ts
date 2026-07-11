import * as THREE from 'three';

/**
 * Coordinate convention bridging gameplay space and Three.js world space.
 *
 * Gameplay uses a 2D {@link Vector2} `(x, y)` on the ground plane plus a scalar
 * `height` above it (design §5). This maps to Three.js as:
 *   worldX = gameplay.x
 *   worldY = height (up)
 *   worldZ = gameplay.y
 *
 * The renderer is the only place this conversion happens; the simulation never
 * knows about Three.js (design §8).
 */
export function toThree(out: THREE.Vector3, x: number, y: number, height = 0): THREE.Vector3 {
  return out.set(x, height, y);
}
