import type { ObstacleType } from './types';

/**
 * Central gameplay tuning constants (design §29 favors explicit, injectable
 * configuration). Values are expressed in world units and seconds unless noted.
 * Tune here to adjust game feel; systems must read from this module rather than
 * hard-coding magic numbers.
 */

export const SIM = {
  /** Fixed simulation rate in Hz (design §25). */
  hz: 60,
  /** Fixed timestep in seconds. */
  get dt(): number {
    return 1 / SIM.hz;
  },
  /** Maximum simulation steps processed per frame to avoid spiral-of-death. */
  maxStepsPerFrame: 5,
} as const;

export const PLAYER = {
  radius: 0.5,
  /** Approximate torso height; snowballs above this arc harmlessly overhead. */
  standHeight: 1.7,
  maxHealth: 100,
  moveSpeed: 6, // world units per second
  acceleration: 40,
  /** Desired spacing between grouped units when moving (design §11). */
  spacing: 1.4,
  /** How fast a unit turns to face its aim/move direction, radians/sec. */
  turnSpeed: 12,
} as const;

export const ENEMY = {
  /**
   * Enemy squad top move speed as a fraction of the player squad's, so the AI
   * team closes distance a little more slowly and stays beatable.
   */
  moveSpeedScale: 0.82,
  /** Enemy hit-stun duration multiplier — enemies stay knocked back longer. */
  hitStunScale: 1.7,
  /** Enemy knockback impulse multiplier — enemies slide a little further. */
  knockbackScale: 1.3,
} as const;

/**
 * Aiming feel while charging a throw (design §11). The unit rotates toward the
 * cursor over time (rather than snapping) and ignores tiny cursor movements
 * within the deadzone, so precise aim is easier. The reticle is drawn at a
 * fixed, generous radius to act as a clear rotation handle.
 */
export const AIM = {
  /**
   * Cursor distance (world units) below which the aim angle is frozen, avoiding
   * wild swings when the cursor is right on top of the unit.
   */
  deadzoneRadius: 1.2,
  /** How fast the unit rotates toward the cursor while aiming, radians/sec. */
  turnSpeed: 15,
  /** Radius (world units) at which the aim reticle/handle is drawn. */
  reticleRadius: 3.6,
} as const;

export const THROW = {
  /** Seconds to reach full charge while holding (design §11). */
  chargeTime: 1.5,
  minSpeed: 8,
  maxSpeed: 20,
  /** Windup duration before the snowball actually leaves the hand. */
  windup: 0.18,
  /** Recovery lock after releasing a throw. */
  recovery: 0.25,
  /** Cooldown before the same unit can throw again (design §13). */
  cooldown: 0.6,
  /** Launch height above the ground (roughly hand height). */
  launchHeight: 1.0,
  /** Initial vertical velocity component of a throw, scaled by charge. */
  launchArc: 4.5,
  /** Extra distance beyond the unit's radius at which a snowball spawns. */
  spawnMargin: 0.6,
} as const;

export const SNOWBALL = {
  radius: 0.22,
  damage: 20,
  /** Gravity applied to vertical velocity, world units/sec^2 (design §12). */
  gravity: 18,
  /** Snowballs are culled after this many seconds as a safety net. */
  maxLifetime: 5,
  poolSize: 64,
} as const;

export const DAMAGE = {
  /** Stun duration applied on hit (design §13). */
  stun: 0.35,
  /** Knockback impulse applied along the snowball's travel direction. */
  knockback: 3.5,
} as const;

/** Pickup buff tuning (design: collectible power-ups on the arena). */
export const BUFF = {
  /** Seconds of damage immunity granted by the immunity pickup. */
  immunityDuration: 5,
  /** Seconds of speed boost granted by the speed pickup. */
  speedDuration: 6,
  /** Move-speed multiplier while the speed buff is active. */
  speedMultiplier: 1.6,
  /** Health (and max health) added by the extra-life pickup. */
  extraLife: 20,
  /** Collision radius for collecting a pickup. */
  pickupRadius: 0.7,
  /** Maximum pickups present on the arena at once. */
  maxActive: 3,
  /** Seconds before the first pickup appears. */
  firstSpawnDelay: 2,
  /** Seconds between pickup spawns while below `maxActive`. */
  spawnInterval: 7,
} as const;

export const AI = {
  /** How often (seconds) an AI unit re-evaluates its utility scores (design §15). */
  decisionInterval: 0.25,
  /** Health fraction below which the unit prefers to retreat. */
  retreatHealthFraction: 0.3,
  /** Distance at which incoming snowballs trigger a dodge (design §3.4). */
  dodgeRadius: 3.5,
} as const;

/** Team colors for procedural rendering (design §8, cartoon palette). */
export const TEAM_COLORS = {
  player: 0x3aa0ff,
  enemy: 0xff5a4d,
} as const;

/**
 * Effective height of each obstacle type, used by the collision system to
 * decide whether a snowball arcs over it and by cover/line-of-sight logic
 * (design §14, §17). Low fences can be thrown over; forts/trees cannot.
 */
export const OBSTACLE_HEIGHT: Record<ObstacleType, number> = {
  tree: 2.4,
  rock: 1.0,
  fort: 1.3,
  fence: 0.85,
  prop: 0.9,
} as const;
