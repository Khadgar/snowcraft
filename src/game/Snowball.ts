import { Vector2 } from '../utils/Vector2';
import { ObjectPool } from '../utils/ObjectPool';
import type { EntityId } from '../ecs/Entity';
import { SNOWBALL } from './config';
import { type Snowball, Team } from './types';

/** Creates a zeroed snowball instance (used to seed the pool). */
export function createSnowball(): Snowball {
  return {
    id: 0,
    position: new Vector2(),
    velocity: new Vector2(),
    height: 0,
    heightVelocity: 0,
    ownerId: 0,
    team: Team.Player,
    damage: SNOWBALL.damage,
    radius: SNOWBALL.radius,
    age: 0,
    alive: false,
  };
}

/** Resets a snowball to a neutral state before returning it to the pool. */
export function resetSnowball(s: Snowball): void {
  s.position.set(0, 0);
  s.velocity.set(0, 0);
  s.height = 0;
  s.heightVelocity = 0;
  s.age = 0;
  s.alive = false;
}

/**
 * Pool of snowballs to avoid per-shot allocations (design §12, §26). The
 * projectile system acquires on throw and releases on impact/expiry.
 */
export function createSnowballPool(size = SNOWBALL.poolSize): ObjectPool<Snowball> {
  return new ObjectPool<Snowball>(createSnowball, resetSnowball, size);
}

/**
 * Initializes a pooled snowball as a freshly launched projectile.
 * `dir` is a normalized ground direction; `speed` and `arc` come from throw
 * charge (design §12).
 */
export function launchSnowball(
  s: Snowball,
  id: EntityId,
  ownerId: EntityId,
  team: Team,
  x: number,
  y: number,
  height: number,
  dir: Readonly<Vector2>,
  speed: number,
  arc: number,
): void {
  (s as { id: EntityId }).id = id;
  s.ownerId = ownerId;
  s.team = team;
  s.position.set(x, y);
  s.velocity.set(dir.x * speed, dir.y * speed);
  s.height = height;
  s.heightVelocity = arc;
  s.damage = SNOWBALL.damage;
  s.radius = SNOWBALL.radius;
  s.age = 0;
  s.alive = true;
}
