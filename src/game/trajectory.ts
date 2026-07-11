import { PLAYER, SIM, SNOWBALL, THROW } from './config';
import { clamp, lerp } from '../utils/math';

/**
 * Shared throw ballistics (design §12). Both the {@link ThrowSystem} (for the
 * real launch) and the aim-preview renderer read from here so the previewed arc
 * can never drift from the snowball that is actually thrown.
 */

/** Launch speed and vertical arc velocity for a given charge in [0, 1]. */
export interface ThrowKinematics {
  /** Horizontal launch speed in world units/sec. */
  speed: number;
  /** Initial vertical velocity in world units/sec. */
  arc: number;
}

/** A single point along a sampled trajectory (ground x/y plus height). */
export interface TrajectoryPoint {
  x: number;
  y: number;
  height: number;
}

/**
 * Maps a normalized charge to launch kinematics. Mirrors the formula used by
 * `ThrowSystem.tryThrow` so the two stay in lockstep.
 */
export function computeThrowKinematics(charge01: number): ThrowKinematics {
  const charge = clamp(charge01, 0, 1);
  return {
    speed: lerp(THROW.minSpeed, THROW.maxSpeed, charge),
    arc: THROW.launchArc * (0.6 + 0.4 * charge),
  };
}

/** Distance from a unit's center at which its snowball spawns. */
export function throwSpawnDistance(): number {
  return PLAYER.radius + THROW.spawnMargin;
}

interface SampleOptions {
  /** Integration timestep; defaults to the fixed simulation step. */
  dt?: number;
  /** Hard cap on integration steps (safety net against runaway loops). */
  maxSteps?: number;
}

const DEFAULT_MAX_STEPS = 240;

/**
 * Integrates the ballistic path a snowball would follow if thrown now from
 * `(playerX, playerY)` toward `(dirX, dirY)` at the given charge, using the
 * exact integration order of {@link import('../systems/ProjectileSystem')} —
 * advance position, apply gravity to vertical velocity, then advance height —
 * so the final point equals the real landing spot.
 *
 * Points are written into `out` (reused in place to avoid per-frame
 * allocations); the return value is the number of valid points. The first
 * point is the launch position and the last is the landing point. Returns 0
 * for a degenerate (zero-length) direction.
 */
export function sampleThrowTrajectory(
  playerX: number,
  playerY: number,
  dirX: number,
  dirY: number,
  charge01: number,
  out: TrajectoryPoint[],
  options: SampleOptions = {},
): number {
  const length = Math.hypot(dirX, dirY);
  if (length <= 1e-9) return 0;

  const ndx = dirX / length;
  const ndy = dirY / length;
  const { speed, arc } = computeThrowKinematics(charge01);
  const dt = options.dt ?? SIM.dt;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const spawnDistance = throwSpawnDistance();

  let x = playerX + ndx * spawnDistance;
  let y = playerY + ndy * spawnDistance;
  let height = THROW.launchHeight;
  const vx = ndx * speed;
  const vy = ndy * speed;
  let heightVelocity = arc;

  let count = 0;
  count = pushPoint(out, count, x, y, height);

  for (let step = 0; step < maxSteps; step++) {
    x += vx * dt;
    y += vy * dt;
    heightVelocity -= SNOWBALL.gravity * dt;
    height += heightVelocity * dt;

    if (height <= 0) {
      count = pushPoint(out, count, x, y, 0);
      break;
    }

    count = pushPoint(out, count, x, y, height);
  }

  return count;
}

/** Writes `(x, y, height)` into `out[index]`, reusing the slot when present. */
function pushPoint(
  out: TrajectoryPoint[],
  index: number,
  x: number,
  y: number,
  height: number,
): number {
  const existing = out[index];
  if (existing) {
    existing.x = x;
    existing.y = y;
    existing.height = height;
  } else {
    out[index] = { x, y, height };
  }
  return index + 1;
}
