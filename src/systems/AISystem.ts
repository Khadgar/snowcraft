import type { EventBus } from '../core/EventBus';
import type { EntityId } from '../ecs/Entity';
import type { System } from '../ecs/System';
import { arenaContains, clampToArena } from '../game/Arena';
import { AI, PLAYER } from '../game/config';
import { canAcceptOrders, transitionTo } from '../game/Player';
import { PlayerState, Team, type Player, type Snowball } from '../game/types';
import type { World } from '../game/World';
import { findCoverSpot, hasLineOfSight } from '../physics/LineOfSight';
import { Vec2Pool } from '../utils/ObjectPool';
import { clamp, inverseLerp, lerp } from '../utils/math';
import { Vector2 } from '../utils/Vector2';
import type { ThrowSystem } from './ThrowSystem';

type AiAction = 'retreat' | 'takeCover' | 'attack' | 'advance' | 'wander';
export type AiDifficulty = 'easy' | 'normal' | 'hard';

interface AiTuning {
  aimErrorScale: number;
  decisionIntervalScale: number;
  throwWillingness: number;
  dodgeReliability: number;
  /** When false, the unit never seeks cover or retreats — it stays exposed. */
  seeksCover: boolean;
}

interface Perception {
  nearestTarget: Player | null;
  nearestDistance: number;
  hasLos: boolean;
  exposed: boolean;
}

interface UtilityScores {
  retreat: number;
  takeCover: number;
  attack: number;
  advance: number;
  wander: number;
}

interface AiDecision {
  action: AiAction;
  targetId: EntityId | null;
}

const ENGAGE_RANGE = 9;
const MIN_THROW_RANGE = 1.5;
const AIM_LEAD_TIME = 0.18;
const AIM_ERROR_NEAR = 0.1;
const AIM_ERROR_FAR = 0.46;
const ADVANCE_STOP_DISTANCE = 6.5;
const MOVE_STEP = 4;
const STRAFE_DISTANCE = 3;
const RETREAT_DISTANCE = 5;
const DODGE_DURATION = 0.22;
const DODGE_DISTANCE = 2.4;
const EPSILON = 1e-9;

const AI_TUNING: Record<AiDifficulty, AiTuning> = {
  easy: {
    aimErrorScale: 4.5,
    decisionIntervalScale: 2.2,
    throwWillingness: 0.55,
    dodgeReliability: 0.25,
    seeksCover: false,
  },
  normal: {
    aimErrorScale: 1,
    decisionIntervalScale: 1,
    throwWillingness: 1,
    dodgeReliability: 1,
    seeksCover: true,
  },
  hard: {
    aimErrorScale: 0.55,
    decisionIntervalScale: 0.7,
    throwWillingness: 1.08,
    dodgeReliability: 1,
    seeksCover: true,
  },
};

/**
 * Utility-scored enemy squad AI. Runs before movement and mutates only
 * simulation orders: enemy move targets, facing, and throws.
 */
export class AISystem implements System {
  readonly name = 'ai';

  private readonly decisionTimers = new Map<EntityId, number>();
  private readonly decisions = new Map<EntityId, AiDecision>();
  private readonly dodgeTimers = new Map<EntityId, number>();
  private readonly arenaClamp = { x: 0, y: 0 };
  private readonly peekCandidate = { x: 0, y: 0 };
  private focusTargetId: EntityId | null = null;
  private readonly tuning: AiTuning;

  constructor(
    private readonly world: World,
    events: EventBus,
    private readonly throwSystem: ThrowSystem,
    difficulty: AiDifficulty = 'normal',
  ) {
    void events;
    this.tuning = AI_TUNING[difficulty];
  }

  update(dt: number): void {
    this.focusTargetId = this.chooseFocusTarget();

    for (const unit of this.world.players) {
      if (unit.team !== Team.Enemy || !unit.alive || !canAcceptOrders(unit)) continue;

      if (this.tryReactiveDodge(unit, dt)) {
        continue;
      }

      const perception = this.perceive(unit);
      const timer = (this.decisionTimers.get(unit.id) ?? 0) - dt;
      if (timer <= 0) {
        const decision = this.chooseDecision(unit, perception);
        this.decisions.set(unit.id, decision);
        this.decisionTimers.set(unit.id, AI.decisionInterval * this.tuning.decisionIntervalScale);
        this.executeDecision(unit, decision, perception);
      } else {
        this.decisionTimers.set(unit.id, timer);
        this.executeDecision(unit, this.decisions.get(unit.id) ?? this.chooseDecision(unit, perception), perception);
      }
    }
  }

  private tryReactiveDodge(unit: Player, dt: number): boolean {
    const dodgeTimer = Math.max(0, (this.dodgeTimers.get(unit.id) ?? 0) - dt);
    const incoming = findMostUrgentIncomingSnowball(unit, this.world.snowballs);

    if (incoming) {
      if (!this.world.rng.chance(this.tuning.dodgeReliability)) {
        return false;
      }

      this.setDodgeTarget(unit, incoming);
      this.dodgeTimers.set(unit.id, DODGE_DURATION);
      return true;
    }

    if (dodgeTimer > 0) {
      this.dodgeTimers.set(unit.id, dodgeTimer);
      return true;
    }

    this.dodgeTimers.delete(unit.id);
    return false;
  }

  private setDodgeTarget(unit: Player, snowball: Snowball): void {
    const speed = snowball.velocity.length();
    if (speed <= EPSILON) return;

    const dirX = snowball.velocity.x / speed;
    const dirY = snowball.velocity.y / speed;
    const leftX = -dirY;
    const leftY = dirX;
    const threat = this.findNearestTarget(unit);

    const leftScore = this.scoreDodgeSide(unit, threat, leftX, leftY);
    const side = leftScore >= this.scoreDodgeSide(unit, threat, -leftX, -leftY) ? 1 : -1;

    this.setMoveTarget(unit, unit.position.x + leftX * side * DODGE_DISTANCE, unit.position.y + leftY * side * DODGE_DISTANCE);
  }

  private scoreDodgeSide(unit: Player, threat: Player | null, sideX: number, sideY: number): number {
    const x = unit.position.x + sideX * DODGE_DISTANCE;
    const y = unit.position.y + sideY * DODGE_DISTANCE;
    let score = arenaContains(this.world.arena, x, y, unit.radius) ? 10 : -10;

    if (threat) {
      score += Math.hypot(x - threat.position.x, y - threat.position.y);
    }

    return score;
  }

  private perceive(unit: Player): Perception {
    const focusTarget = this.resolveTarget(this.focusTargetId);
    let nearestTarget: Player | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;
    let focusDistanceSq = Number.POSITIVE_INFINITY;
    let focusHasLos = false;
    let exposed = false;

    for (const target of this.world.players) {
      if (target.team !== Team.Player || !target.alive) continue;

      const distanceSq = unit.position.distanceToSq(target.position);
      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearestTarget = target;
      }

      if (!exposed && hasLineOfSight(this.world.arena, target.position.x, target.position.y, unit.position.x, unit.position.y)) {
        exposed = true;
      }

      if (target === focusTarget) {
        focusDistanceSq = distanceSq;
        focusHasLos = hasLineOfSight(
          this.world.arena,
          unit.position.x,
          unit.position.y,
          target.position.x,
          target.position.y,
        );
      }
    }

    if (
      focusTarget &&
      focusHasLos &&
      (focusDistanceSq <= ENGAGE_RANGE * ENGAGE_RANGE || focusDistanceSq <= nearestDistanceSq * 1.8)
    ) {
      nearestTarget = focusTarget;
      nearestDistanceSq = focusDistanceSq;
    }

    const nearestDistance = nearestTarget ? Math.sqrt(nearestDistanceSq) : Number.POSITIVE_INFINITY;
    const hasLos = nearestTarget
      ? nearestTarget === focusTarget
        ? focusHasLos
        : hasLineOfSight(
            this.world.arena,
            unit.position.x,
            unit.position.y,
            nearestTarget.position.x,
            nearestTarget.position.y,
          )
      : false;

    return { nearestTarget, nearestDistance, hasLos, exposed };
  }

  private chooseDecision(unit: Player, perception: Perception): AiDecision {
    const scores = scoreActions(unit, perception);
    if (!this.tuning.seeksCover) {
      // Easy enemies stay in the open: never duck behind obstacles or retreat.
      scores.takeCover = 0;
      scores.retreat = 0;
    }
    const action = bestAction(scores);

    return { action, targetId: perception.nearestTarget?.id ?? null };
  }

  private executeDecision(unit: Player, decision: AiDecision, perception: Perception): void {
    const target = this.resolveTarget(decision.targetId) ?? perception.nearestTarget;

    switch (decision.action) {
      case 'retreat':
        this.retreat(unit, target);
        break;
      case 'takeCover':
        this.takeCover(unit, target);
        break;
      case 'attack':
        if (target) {
          this.attack(unit, target, unit.position.distanceTo(target.position));
        }
        break;
      case 'advance':
        this.advance(unit, target);
        break;
      case 'wander':
        this.wander(unit);
        break;
    }
  }

  private retreat(unit: Player, target: Player | null): void {
    if (!target) {
      this.wander(unit);
      return;
    }

    const cover = findCoverSpot(
      this.world.arena,
      target.position.x,
      target.position.y,
      unit.position.x,
      unit.position.y,
      unit.radius,
    );

    if (cover) {
      this.setMoveTarget(unit, cover.x, cover.y);
      return;
    }

    const away = Vec2Pool.acquire(unit.position.x - target.position.x, unit.position.y - target.position.y);
    normalizeOrFallback(away, unit.position.x, unit.position.y);
    this.setMoveTarget(unit, unit.position.x + away.x * RETREAT_DISTANCE, unit.position.y + away.y * RETREAT_DISTANCE);
    Vec2Pool.release(away);
  }

  private takeCover(unit: Player, target: Player | null): void {
    if (!target) {
      this.wander(unit);
      return;
    }

    const distance = unit.position.distanceTo(target.position);
    const canThrow = unit.throwCooldown <= 0 && distance <= ENGAGE_RANGE;
    if (canThrow) {
      if (hasLineOfSight(this.world.arena, unit.position.x, unit.position.y, target.position.x, target.position.y)) {
        this.attack(unit, target, distance);
        return;
      }

      if (this.findPeekSpot(unit, target)) {
        this.setMoveTarget(unit, this.peekCandidate.x, this.peekCandidate.y);
        return;
      }
    }

    const cover = findCoverSpot(
      this.world.arena,
      target.position.x,
      target.position.y,
      unit.position.x,
      unit.position.y,
      unit.radius,
    );

    if (cover) {
      this.setMoveTarget(unit, cover.x, cover.y);
      return;
    }

    this.strafe(unit, target);
  }

  private attack(unit: Player, target: Player, distance: number): void {
    unit.moveTarget = null;

    const charge01 = clamp(inverseLerp(MIN_THROW_RANGE, ENGAGE_RANGE, distance) * 0.9 + 0.1, 0.18, 1);
    const error = lerp(AIM_ERROR_NEAR, AIM_ERROR_FAR, charge01) * this.tuning.aimErrorScale;
    const aimX = target.position.x + target.velocity.x * AIM_LEAD_TIME + this.world.rng.range(-error, error);
    const aimY = target.position.y + target.velocity.y * AIM_LEAD_TIME + this.world.rng.range(-error, error);
    const dx = aimX - unit.position.x;
    const dy = aimY - unit.position.y;

    if (dx * dx + dy * dy > EPSILON) {
      unit.rotation = Math.atan2(dy, dx);
    }

    if (this.tuning.throwWillingness >= 1 || this.world.rng.chance(this.tuning.throwWillingness)) {
      this.throwSystem.tryThrow(unit, aimX, aimY, charge01);
    }
  }

  private advance(unit: Player, target: Player | null): void {
    if (!target) {
      this.wander(unit);
      return;
    }

    const toTarget = Vec2Pool.acquire(target.position.x - unit.position.x, target.position.y - unit.position.y);
    normalizeOrFallback(toTarget, target.position.x, target.position.y);

    const destinationDistance = Math.min(MOVE_STEP, Math.max(0, unit.position.distanceTo(target.position) - ADVANCE_STOP_DISTANCE));
    const desiredX = unit.position.x + toTarget.x * (destinationDistance > 0 ? destinationDistance : MOVE_STEP * 0.5);
    const desiredY = unit.position.y + toTarget.y * (destinationDistance > 0 ? destinationDistance : MOVE_STEP * 0.5);
    const separation = Vec2Pool.acquire();

    computeAllySeparation(unit, this.world.players, separation);
    this.setMoveTarget(unit, desiredX + separation.x, desiredY + separation.y);
    Vec2Pool.release(toTarget, separation);
  }

  private strafe(unit: Player, target: Player): void {
    const awayX = unit.position.x - target.position.x;
    const awayY = unit.position.y - target.position.y;
    const len = Math.hypot(awayX, awayY);
    const sideX = len > EPSILON ? -awayY / len : 0;
    const sideY = len > EPSILON ? awayX / len : 1;
    const side = this.world.rng.chance(0.5) ? 1 : -1;

    this.setMoveTarget(unit, unit.position.x + sideX * side * STRAFE_DISTANCE, unit.position.y + sideY * side * STRAFE_DISTANCE);
  }

  private wander(unit: Player): void {
    if (unit.moveTarget && unit.position.distanceToSq(unit.moveTarget) > PLAYER.spacing * PLAYER.spacing) return;

    const nearCenter = Math.hypot(unit.position.x, unit.position.y) < PLAYER.spacing;
    const x = nearCenter ? this.world.rng.range(-this.world.arena.width * 0.25, this.world.arena.width * 0.25) : 0;
    const y = nearCenter ? this.world.rng.range(-this.world.arena.height * 0.25, this.world.arena.height * 0.25) : 0;
    this.setMoveTarget(unit, x, y);
  }

  private setMoveTarget(unit: Player, x: number, y: number): void {
    clampToArena(this.world.arena, x, y, unit.radius, this.arenaClamp);

    if (unit.moveTarget) {
      unit.moveTarget.set(this.arenaClamp.x, this.arenaClamp.y);
    } else {
      unit.moveTarget = new Vector2(this.arenaClamp.x, this.arenaClamp.y);
    }

    transitionTo(unit, PlayerState.Moving);
  }

  private resolveTarget(targetId: EntityId | null): Player | null {
    if (targetId === null) return null;
    const target = this.world.getPlayer(targetId);
    return target && target.alive && target.team === Team.Player ? target : null;
  }

  private findNearestTarget(unit: Player): Player | null {
    let nearest: Player | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;

    for (const target of this.world.players) {
      if (target.team !== Team.Player || !target.alive) continue;
      const distanceSq = unit.position.distanceToSq(target.position);
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        nearest = target;
      }
    }

    return nearest;
  }

  private chooseFocusTarget(): EntityId | null {
    let bestTarget: Player | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    const enemyCount = Math.max(1, this.world.countLiving(Team.Enemy));

    for (const target of this.world.players) {
      if (target.team !== Team.Player || !target.alive) continue;

      let visibleEnemies = 0;
      let proximityScore = 0;

      for (const enemy of this.world.players) {
        if (enemy.team !== Team.Enemy || !enemy.alive) continue;

        const distance = enemy.position.distanceTo(target.position);
        proximityScore += 1 - clamp(distance / (ENGAGE_RANGE * 1.5), 0, 1);
        if (hasLineOfSight(this.world.arena, enemy.position.x, enemy.position.y, target.position.x, target.position.y)) {
          visibleEnemies++;
        }
      }

      if (visibleEnemies === 0) continue;

      const healthScore = 1 - clamp(target.health / target.maxHealth, 0, 1);
      const exposureScore = visibleEnemies / enemyCount;
      const score = healthScore * 1.4 + exposureScore * 0.75 + proximityScore * 0.35;
      if (score > bestScore) {
        bestScore = score;
        bestTarget = target;
      }
    }

    return bestTarget?.id ?? null;
  }

  private findPeekSpot(unit: Player, target: Player): boolean {
    const towardX = target.position.x - unit.position.x;
    const towardY = target.position.y - unit.position.y;
    const len = Math.hypot(towardX, towardY);
    if (len <= EPSILON) return false;

    const dirX = towardX / len;
    const dirY = towardY / len;

    for (let step = 0.75; step <= 2.25; step += 0.75) {
      const x = unit.position.x + dirX * step;
      const y = unit.position.y + dirY * step;
      clampToArena(this.world.arena, x, y, unit.radius, this.peekCandidate);

      if (
        hasLineOfSight(
          this.world.arena,
          this.peekCandidate.x,
          this.peekCandidate.y,
          target.position.x,
          target.position.y,
        )
      ) {
        return true;
      }
    }

    return false;
  }
}

function scoreActions(unit: Player, perception: Perception): UtilityScores {
  const hasTarget = perception.nearestTarget !== null;
  const inRange = perception.nearestDistance <= ENGAGE_RANGE;
  const cooldownReady = unit.throwCooldown <= 0;
  const healthRisk = inverseLerp(
    unit.maxHealth * AI.retreatHealthFraction,
    unit.maxHealth * 0.05,
    unit.health,
  );

  return {
    retreat: scoreRetreat(healthRisk, perception.exposed),
    takeCover: scoreTakeCover(perception.exposed, cooldownReady, inRange, hasTarget),
    attack: scoreAttack(perception.hasLos, inRange, cooldownReady),
    advance: scoreAdvance(hasTarget, perception.hasLos, inRange),
    wander: hasTarget ? 0.05 : 0.6,
  };
}

function scoreRetreat(healthRisk: number, exposed: boolean): number {
  return exposed ? healthRisk * 1.1 : healthRisk * 0.45;
}

function scoreTakeCover(exposed: boolean, cooldownReady: boolean, inRange: boolean, hasTarget: boolean): number {
  if (!hasTarget) return 0;
  if (!exposed && cooldownReady && inRange) return 0.6;
  if (!exposed || (cooldownReady && inRange)) return 0;
  return cooldownReady ? 0.48 : 0.72;
}

function scoreAttack(hasLos: boolean, inRange: boolean, cooldownReady: boolean): number {
  return hasLos && inRange && cooldownReady ? 0.95 : 0;
}

function scoreAdvance(hasTarget: boolean, hasLos: boolean, inRange: boolean): number {
  if (!hasTarget) return 0;
  if (!inRange) return 0.62;
  return hasLos ? 0.18 : 0.55;
}

function bestAction(scores: UtilityScores): AiAction {
  let action: AiAction = 'wander';
  let score = scores.wander;

  if (scores.advance > score) {
    action = 'advance';
    score = scores.advance;
  }
  if (scores.takeCover > score) {
    action = 'takeCover';
    score = scores.takeCover;
  }
  if (scores.retreat > score) {
    action = 'retreat';
    score = scores.retreat;
  }
  if (scores.attack > score) {
    action = 'attack';
  }

  return action;
}

function findMostUrgentIncomingSnowball(unit: Player, snowballs: readonly Snowball[]): Snowball | null {
  let best: Snowball | null = null;
  let bestDistanceSq = AI.dodgeRadius * AI.dodgeRadius;

  for (const snowball of snowballs) {
    if (!snowball.alive || snowball.team === unit.team || snowball.ownerId === unit.id || snowball.height >= 2) continue;

    const toUnitX = unit.position.x - snowball.position.x;
    const toUnitY = unit.position.y - snowball.position.y;
    const distanceSq = toUnitX * toUnitX + toUnitY * toUnitY;
    if (distanceSq > bestDistanceSq) continue;

    const approaching = snowball.velocity.x * toUnitX + snowball.velocity.y * toUnitY > 0;
    if (!approaching) continue;

    bestDistanceSq = distanceSq;
    best = snowball;
  }

  return best;
}

function computeAllySeparation(unit: Player, players: readonly Player[], out: Vector2): void {
  out.set(0, 0);
  const spacing = PLAYER.spacing * 2;
  const spacingSq = spacing * spacing;

  for (const ally of players) {
    if (ally === unit || ally.team !== unit.team || !ally.alive) continue;

    const dx = unit.position.x - ally.position.x;
    const dy = unit.position.y - ally.position.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq <= EPSILON || distanceSq >= spacingSq) continue;

    const distance = Math.sqrt(distanceSq);
    const strength = (spacing - distance) / spacing;
    out.x += (dx / distance) * strength * PLAYER.spacing;
    out.y += (dy / distance) * strength * PLAYER.spacing;
  }
}

function normalizeOrFallback(vector: Vector2, fallbackX: number, fallbackY: number): void {
  if (vector.lengthSq() > EPSILON) {
    vector.normalize();
    return;
  }

  const len = Math.hypot(fallbackX, fallbackY);
  if (len > EPSILON) {
    vector.set(fallbackX / len, fallbackY / len);
  } else {
    vector.set(1, 0);
  }
}
