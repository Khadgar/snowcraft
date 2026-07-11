import type { Command } from '../core/commands';
import type { System } from '../ecs/System';
import { clampToArena } from '../game/Arena';
import { BUFF, ENEMY, PLAYER } from '../game/config';
import { canAcceptOrders, transitionTo } from '../game/Player';
import { PlayerState, Team, type Arena, type Player } from '../game/types';
import type { World } from '../game/World';
import { segmentVsShape } from '../physics/Collision';
import { PathGrid, type PathWaypoint } from '../physics/Pathfinding';
import type { CircleShape, RectShape } from '../physics/shapes';
import { Vec2Pool } from '../utils/ObjectPool';
import { Vector2 } from '../utils/Vector2';
import { clamp, moveTowards, rotateTowards } from '../utils/math';

const ARRIVAL_THRESHOLD = PLAYER.radius * 0.2;
const ARRIVAL_SLOW_RADIUS = PLAYER.spacing * 1.5;
const SEPARATION_ACCEL_SCALE = 0.45;
const EPSILON = 1e-6;
const PATH_TARGET_EPSILON_SQ = 0.25 * 0.25;
const WAYPOINT_THRESHOLD = PLAYER.radius * 0.75;

interface UnitPathState {
  targetX: number;
  targetY: number;
  waypoints: PathWaypoint[];
  waypointIndex: number;
}

/**
 * Computes an arrival-scaled desired velocity toward a target.
 */
export function computeDesiredVelocity(
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  maxSpeed: number,
  slowRadius: number,
  out: Vector2,
): Vector2 {
  const dx = targetX - x;
  const dy = targetY - y;
  const distance = Math.hypot(dx, dy);

  if (distance <= EPSILON) {
    return out.set(0, 0);
  }

  const speed = maxSpeed * clamp(distance / slowRadius, 0, 1);
  return out.set((dx / distance) * speed, (dy / distance) * speed);
}

/**
 * Computes a normalized separation bias away from nearby units.
 */
export function computeSeparationVector(
  player: Player,
  players: readonly Player[],
  spacing: number,
  out: Vector2,
): Vector2 {
  out.set(0, 0);

  for (const other of players) {
    if (other === player || !other.alive) continue;

    const dx = player.position.x - other.position.x;
    const dy = player.position.y - other.position.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq >= spacing * spacing) continue;

    if (distanceSq <= EPSILON) {
      out.x += player.id <= other.id ? -1 : 1;
      continue;
    }

    const distance = Math.sqrt(distanceSq);
    const strength = (spacing - distance) / spacing;
    out.x += (dx / distance) * strength;
    out.y += (dy / distance) * strength;
  }

  return out.clampLength(1);
}

/**
 * Computes the smallest push that moves a circle outside a circle obstacle.
 */
export function computeCircleCirclePushout(
  x: number,
  y: number,
  radius: number,
  circle: CircleShape,
  out: Vector2,
): Vector2 {
  const dx = x - circle.x;
  const dy = y - circle.y;
  const minDistance = radius + circle.radius;
  const distanceSq = dx * dx + dy * dy;

  if (distanceSq >= minDistance * minDistance) {
    return out.set(0, 0);
  }

  if (distanceSq <= EPSILON) {
    return out.set(minDistance, 0);
  }

  const distance = Math.sqrt(distanceSq);
  const push = minDistance - distance;
  return out.set((dx / distance) * push, (dy / distance) * push);
}

/**
 * Computes the smallest push that moves a circle outside an AABB rectangle.
 */
export function computeCircleRectPushout(
  x: number,
  y: number,
  radius: number,
  rect: RectShape,
  out: Vector2,
): Vector2 {
  const closestX = clamp(x, rect.x - rect.halfW, rect.x + rect.halfW);
  const closestY = clamp(y, rect.y - rect.halfH, rect.y + rect.halfH);
  const dx = x - closestX;
  const dy = y - closestY;
  const distanceSq = dx * dx + dy * dy;

  if (distanceSq > EPSILON) {
    if (distanceSq >= radius * radius) {
      return out.set(0, 0);
    }

    const distance = Math.sqrt(distanceSq);
    const push = radius - distance;
    return out.set((dx / distance) * push, (dy / distance) * push);
  }

  const left = Math.abs(x - (rect.x - rect.halfW));
  const right = Math.abs(rect.x + rect.halfW - x);
  const bottom = Math.abs(y - (rect.y - rect.halfH));
  const top = Math.abs(rect.y + rect.halfH - y);
  const min = Math.min(left, right, bottom, top);

  if (min === left) return out.set(-(radius + left), 0);
  if (min === right) return out.set(radius + right, 0);
  if (min === bottom) return out.set(0, -(radius + bottom));
  return out.set(0, radius + top);
}

/**
 * Moves units through the fixed-step simulation using arrival steering,
 * separation, and lightweight obstacle pushout.
 */
export class MovementSystem implements System {
  readonly name = 'movement';

  private readonly arenaClamp = { x: 0, y: 0 };
  private readonly pathGrid: PathGrid;
  private readonly paths = new Map<Player['id'], UnitPathState>();
  private readonly keyboardAxis = new Vector2(0, 0);
  private readonly keyboardDriven = new Set<Player['id']>();

  constructor(private readonly world: World) {
    this.pathGrid = new PathGrid(world.arena);
  }

  handleCommand(command: Command): void {
    if (command.type === 'MoveAxis') {
      this.keyboardAxis.set(command.x, command.y);
      return;
    }
    if (command.type !== 'MoveUnits') return;

    const selectedPlayers = this.world.players.filter((player) => player.selected && canAcceptOrders(player));
    const count = selectedPlayers.length;
    if (count === 0) return;

    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);

    for (let i = 0; i < count; i++) {
      const player = selectedPlayers[i];
      const column = i % columns;
      const row = Math.floor(i / columns);
      const x = command.x + (column - (columns - 1) / 2) * PLAYER.spacing;
      const y = command.y + (row - (rows - 1) / 2) * PLAYER.spacing;

      clampToArena(this.world.arena, x, y, player.radius, this.arenaClamp);
      if (player.moveTarget) {
        player.moveTarget.set(this.arenaClamp.x, this.arenaClamp.y);
      } else {
        player.moveTarget = new Vector2(this.arenaClamp.x, this.arenaClamp.y);
      }
      transitionTo(player, PlayerState.Moving);
    }
  }

  update(dt: number): void {
    this.applyKeyboardMovement(dt);

    const desired = Vec2Pool.acquire();
    const separation = Vec2Pool.acquire();

    for (const player of this.world.players) {
      if (!player.moveTarget) {
        this.paths.delete(player.id);
        continue;
      }
      if (!player.alive || !canAcceptOrders(player)) continue;

      const target = player.moveTarget;
      const distanceToTarget = player.position.distanceTo(target);
      if (distanceToTarget <= ARRIVAL_THRESHOLD) {
        this.stopAtTarget(player);
        continue;
      }

      const steeringTarget = this.getSteeringTarget(player, target);
      const maxSpeed = maxSpeedFor(player);

      computeDesiredVelocity(
        player.position.x,
        player.position.y,
        steeringTarget.x,
        steeringTarget.y,
        maxSpeed,
        ARRIVAL_SLOW_RADIUS,
        desired,
      );
      computeSeparationVector(player, this.world.players, PLAYER.spacing, separation);
      desired.addScaled(separation, maxSpeed * SEPARATION_ACCEL_SCALE).clampLength(maxSpeed);

      const maxVelocityDelta = PLAYER.acceleration * dt;
      player.velocity.x = moveTowards(player.velocity.x, desired.x, maxVelocityDelta);
      player.velocity.y = moveTowards(player.velocity.y, desired.y, maxVelocityDelta);
      player.velocity.clampLength(maxSpeed);

      if (player.velocity.lengthSq() > EPSILON) {
        player.rotation = rotateTowards(
          player.rotation,
          Math.atan2(player.velocity.y, player.velocity.x),
          PLAYER.turnSpeed * dt,
        );
      }

      player.position.addScaled(player.velocity, dt);

      if (player.position.distanceTo(target) <= ARRIVAL_THRESHOLD) {
        this.stopAtTarget(player);
      }
    }

    Vec2Pool.release(desired, separation);

    this.resolvePlayerSpacing();
    this.resolveArenaAndObstacles();
  }

  private stopAtTarget(player: Player): void {
    if (player.moveTarget) {
      player.position.copy(player.moveTarget);
    }
    player.velocity.set(0, 0);
    player.moveTarget = null;
    transitionTo(player, PlayerState.Idle);
  }

  /**
   * Directly steers the selected friendly squad from WASD input. Keyboard
   * movement overrides any mouse move target and, when released, brings the
   * driven units to a stop (without clobbering knockback on stunned units).
   */
  private applyKeyboardMovement(dt: number): void {
    const active = this.keyboardAxis.lengthSq() > EPSILON;

    for (const player of this.world.players) {
      const drivable =
        player.alive && player.team === Team.Player && player.selected && canAcceptOrders(player);

      if (active && drivable) {
        player.moveTarget = null;
        this.paths.delete(player.id);
        this.keyboardDriven.add(player.id);

        const maxSpeed = maxSpeedFor(player);
        const maxDelta = PLAYER.acceleration * dt;
        player.velocity.x = moveTowards(player.velocity.x, this.keyboardAxis.x * maxSpeed, maxDelta);
        player.velocity.y = moveTowards(player.velocity.y, this.keyboardAxis.y * maxSpeed, maxDelta);
        player.velocity.clampLength(maxSpeed);

        if (player.velocity.lengthSq() > EPSILON) {
          player.rotation = rotateTowards(
            player.rotation,
            Math.atan2(player.velocity.y, player.velocity.x),
            PLAYER.turnSpeed * dt,
          );
        }
        player.position.addScaled(player.velocity, dt);
        transitionTo(player, PlayerState.Moving);
      } else if (this.keyboardDriven.delete(player.id) && canAcceptOrders(player)) {
        player.velocity.set(0, 0);
        if (player.state === PlayerState.Moving) {
          transitionTo(player, PlayerState.Idle);
        }
      }
    }
  }

  private getSteeringTarget(player: Player, target: Vector2): PathWaypoint {
    if (!this.isMovementPathBlocked(player.position.x, player.position.y, target.x, target.y)) {
      this.paths.delete(player.id);
      return target;
    }

    let state = this.paths.get(player.id);
    if (!state || hasTargetChanged(state, target)) {
      const waypoints = this.pathGrid.findPath(player.position.x, player.position.y, target.x, target.y);
      if (!waypoints || waypoints.length === 0) {
        this.paths.delete(player.id);
        return target;
      }

      state = {
        targetX: target.x,
        targetY: target.y,
        waypoints,
        waypointIndex: 0,
      };
      this.paths.set(player.id, state);
    }

    while (
      state.waypointIndex < state.waypoints.length - 1 &&
      distanceSq(player.position, state.waypoints[state.waypointIndex]) <= WAYPOINT_THRESHOLD * WAYPOINT_THRESHOLD
    ) {
      state.waypointIndex++;
    }

    return state.waypoints[state.waypointIndex] ?? target;
  }

  private isMovementPathBlocked(ax: number, ay: number, bx: number, by: number): boolean {
    for (const obstacle of this.world.arena.obstacles) {
      if (obstacle.blocksMovement && segmentVsShape(ax, ay, bx, by, obstacle.collision)) {
        return true;
      }
    }

    return false;
  }

  private resolvePlayerSpacing(): void {
    for (let i = 0; i < this.world.players.length; i++) {
      const a = this.world.players[i];
      if (!a.alive) continue;

      for (let j = i + 1; j < this.world.players.length; j++) {
        const b = this.world.players[j];
        if (!b.alive) continue;

        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const minDistance = Math.max(a.radius + b.radius, PLAYER.spacing);
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq >= minDistance * minDistance) continue;

        if (distanceSq <= EPSILON) {
          const push = minDistance / 2;
          a.position.x -= push;
          b.position.x += push;
          continue;
        }

        const distance = Math.sqrt(distanceSq);
        const push = (minDistance - distance) / 2;
        const nx = dx / distance;
        const ny = dy / distance;
        a.position.x += nx * push;
        a.position.y += ny * push;
        b.position.x -= nx * push;
        b.position.y -= ny * push;
      }
    }

  }

  private resolveArenaAndObstacles(): void {
    const push = Vec2Pool.acquire();

    for (const player of this.world.players) {
      if (!player.alive) continue;

      for (const obstacle of this.world.arena.obstacles) {
        if (!obstacle.blocksMovement) continue;

        const shape = obstacle.collision;
        if (shape.kind === 'circle') {
          computeCircleCirclePushout(player.position.x, player.position.y, player.radius, shape, push);
        } else if (shape.kind === 'rect') {
          computeCircleRectPushout(player.position.x, player.position.y, player.radius, shape, push);
        } else {
          push.set(0, 0);
        }

        if (push.lengthSq() > EPSILON) {
          player.position.add(push);
          if (player.velocity.dot(push) < 0) {
            player.velocity.set(0, 0);
          }
        }

      }

      this.clampPlayerToArena(this.world.arena, player);
    }

    Vec2Pool.release(push);
  }

  private clampPlayerToArena(arena: Arena, player: Player): void {
    clampToArena(arena, player.position.x, player.position.y, player.radius, this.arenaClamp);
    player.position.set(this.arenaClamp.x, this.arenaClamp.y);
  }
}

function hasTargetChanged(state: UnitPathState, target: Vector2): boolean {
  const dx = state.targetX - target.x;
  const dy = state.targetY - target.y;
  return dx * dx + dy * dy > PATH_TARGET_EPSILON_SQ;
}

/** Top move speed for a unit; the enemy squad moves a little slower (design §3). */
export function maxSpeedFor(player: Player): number {
  const base = player.team === Team.Enemy ? PLAYER.moveSpeed * ENEMY.moveSpeedScale : PLAYER.moveSpeed;
  return player.speedTimer > 0 ? base * BUFF.speedMultiplier : base;
}

function distanceSq(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
