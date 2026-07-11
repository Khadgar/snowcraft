import type { Vector2 } from '../utils/Vector2';
import type { Health, Transform2D } from '../ecs/Component';
import type { EntityId } from '../ecs/Entity';
import type { Shape } from '../physics/shapes';

/** The two opposing squads (design §2). */
export enum Team {
  Player = 'player',
  Enemy = 'enemy',
}

/** Finite state machine states for a unit (design §10). */
export enum PlayerState {
  Idle = 'idle',
  Moving = 'moving',
  PreparingThrow = 'preparingThrow',
  Throwing = 'throwing',
  Recovering = 'recovering',
  Hit = 'hit',
  Frozen = 'frozen',
  Defeated = 'defeated',
}

/** Transform-based animation clips (design §18). */
export type AnimationName = 'idle' | 'walk' | 'throw' | 'hit' | 'victory' | 'defeated';

/**
 * A controllable child unit. Pure simulation data (design §7, §9); rendering
 * observes this and never mutates it.
 */
export interface Player extends Transform2D, Health {
  readonly id: EntityId;
  team: Team;
  state: PlayerState;
  /** Destination for movement, or null when stationary (design §11). */
  moveTarget: Vector2 | null;
  /** Seconds remaining before this unit can throw again (design §13). */
  throwCooldown: number;
  /** Charge accumulated while holding to throw, in [0, 1] (design §11). */
  throwCharge: number;
  /** Normalized aim direction for the pending/last throw. */
  aimDirection: Vector2;
  /** Seconds remaining of stun/hit lock (design §13). */
  stunTimer: number;
  /** Timer used to sequence the throw windup/release. */
  throwTimer: number;
  currentAnimation: AnimationName;
  /** Local animation clock in seconds, driven by the animation system. */
  animationTime: number;
  selected: boolean;
  alive: boolean;
  /** Collision/selection radius in world units. */
  radius: number;
  /** Seconds of remaining damage immunity from a pickup buff. */
  immunityTimer: number;
  /** Seconds of remaining speed boost from a pickup buff. */
  speedTimer: number;
}

/**
 * A thrown snowball. Travels across the ground (position/velocity) while
 * arcing vertically via `height`/`heightVelocity` under gravity (design §12).
 */
export interface Snowball {
  readonly id: EntityId;
  position: Vector2;
  velocity: Vector2;
  /** Height above the ground plane in world units. */
  height: number;
  /** Vertical speed; gravity is subtracted each step (design §12). */
  heightVelocity: number;
  ownerId: EntityId;
  team: Team;
  damage: number;
  radius: number;
  /** Seconds since launch, used for trails/culling. */
  age: number;
  alive: boolean;
}

export type ObstacleType = 'tree' | 'rock' | 'fort' | 'fence' | 'prop';

/** Collectible buff types dropped onto the arena (design: pickups). */
export type BuffType = 'life' | 'immunity' | 'speed';

/**
 * A collectible buff sitting on the ground. Units of an eligible team collect it
 * by overlapping it; the pickup system then applies the effect and removes it.
 */
export interface Pickup {
  readonly id: EntityId;
  type: BuffType;
  position: Vector2;
  radius: number;
  active: boolean;
}

/**
 * A static arena obstacle. `collision` blocks movement/projectiles; `cover`
 * (when present) also blocks line of sight (design §14, §17).
 */
export interface Obstacle {
  readonly id: EntityId;
  type: ObstacleType;
  position: Vector2;
  collision: Shape;
  cover: Shape | null;
  blocksSight: boolean;
  blocksProjectiles: boolean;
  blocksMovement: boolean;
}

export interface SpawnPoint {
  team: Team;
  x: number;
  y: number;
}

/** Loaded, simulation-ready arena (design §6). */
export interface Arena {
  width: number;
  height: number;
  obstacles: Obstacle[];
  spawns: SpawnPoint[];
}

/* ---- JSON map schema (design §6) ---------------------------------------- */

export interface MapObjectData {
  type: ObstacleType;
  x: number;
  y: number;
  /** Optional per-instance overrides. */
  radius?: number;
  width?: number;
  height?: number;
  rotation?: number;
}

export interface MapSpawnData {
  team: Team;
  x: number;
  y: number;
}

export interface MapData {
  name?: string;
  width: number;
  height: number;
  objects: MapObjectData[];
  spawns?: MapSpawnData[];
}
