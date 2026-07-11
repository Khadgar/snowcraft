import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../core/events';
import { EventBus } from '../core/EventBus';
import { createEmptyArena } from '../game/Arena';
import { createObstacle } from '../game/Obstacle';
import { Team } from '../game/types';
import { World } from '../game/World';
import { MovementSystem } from './MovementSystem';
import { ThrowSystem } from './ThrowSystem';
import { AISystem, type AiDifficulty } from './AISystem';
import type { Snowball } from '../game/types';

const DT = 1 / 60;

function createHarness(difficulty: AiDifficulty = 'normal', seed = 12345): {
  world: World;
  events: EventBus;
  throwSystem: ThrowSystem;
  aiSystem: AISystem;
  thrownEvents: GameEvents['SnowballThrown'][];
} {
  const world = new World(createEmptyArena(), seed);
  const events = new EventBus();
  const throwSystem = new ThrowSystem(world, events);
  const aiSystem = new AISystem(world, events, throwSystem, difficulty);
  const thrownEvents: GameEvents['SnowballThrown'][] = [];

  events.on('SnowballThrown', (event) => {
    thrownEvents.push(event);
  });

  return { world, events, throwSystem, aiSystem, thrownEvents };
}

function step(aiSystem: AISystem, throwSystem: ThrowSystem, count: number): void {
  for (let i = 0; i < count; i++) {
    aiSystem.update(DT);
    throwSystem.update(DT);
  }
}

function firstEnemySnowball(world: World): Snowball {
  const snowball = world.snowballs.find((candidate) => candidate.alive && candidate.team === Team.Enemy);
  expect(snowball).toBeDefined();
  return snowball as Snowball;
}

function aimError(snowball: Snowball, targetX: number, targetY: number): number {
  const velocityLength = snowball.velocity.length();
  const targetDx = targetX - snowball.position.x;
  const targetDy = targetY - snowball.position.y;
  const targetLength = Math.hypot(targetDx, targetDy);
  expect(velocityLength).toBeGreaterThan(0);
  expect(targetLength).toBeGreaterThan(0);

  const dot = (snowball.velocity.x * targetDx + snowball.velocity.y * targetDy) / (velocityLength * targetLength);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

function countEnemyThrows(difficulty: AiDifficulty, seed: number): number {
  const { world, aiSystem, throwSystem, thrownEvents } = createHarness(difficulty, seed);
  world.addPlayer(Team.Enemy, 0, 0);
  world.addPlayer(Team.Player, 5, 0.8);

  step(aiSystem, throwSystem, 120);

  return thrownEvents.filter((event) => event.team === Team.Enemy).length;
}

describe('AISystem', () => {
  it('throws at a visible player in short effective range', () => {
    const { world, aiSystem, throwSystem, thrownEvents } = createHarness();
    const enemy = world.addPlayer(Team.Enemy, 0, 0);
    world.addPlayer(Team.Player, 5, 0);

    step(aiSystem, throwSystem, 5);

    expect(thrownEvents.some((event) => event.ownerId === enemy.id && event.team === Team.Enemy)).toBe(true);
  });

  it('advances toward a far player', () => {
    const { world, aiSystem, throwSystem } = createHarness();
    const enemy = world.addPlayer(Team.Enemy, 0, 0);
    world.addPlayer(Team.Player, 20, 0);
    const movement = new MovementSystem(world);

    for (let i = 0; i < 8; i++) {
      aiSystem.update(DT);
      throwSystem.update(DT);
      movement.update(DT);
    }

    expect(enemy.moveTarget).not.toBeNull();
    expect(enemy.moveTarget?.x).toBeGreaterThan(enemy.position.x);
    expect(Math.abs(enemy.moveTarget?.y ?? 0)).toBeLessThan(1);
  });

  it('dodges an approaching low snowball perpendicular to its travel', () => {
    const { world, aiSystem } = createHarness();
    const enemy = world.addPlayer(Team.Enemy, 0, 0);
    const player = world.addPlayer(Team.Player, -4, 0);
    const snowball = world.acquireSnowball();
    snowball.alive = true;
    snowball.team = Team.Player;
    snowball.ownerId = player.id;
    snowball.position.set(-1.5, 0);
    snowball.velocity.set(10, 0);
    snowball.height = 1;

    aiSystem.update(DT);

    expect(enemy.moveTarget).not.toBeNull();
    expect(Math.abs(enemy.moveTarget?.y ?? 0)).toBeGreaterThan(0.5);
    expect(Math.abs(enemy.moveTarget?.x ?? 0)).toBeLessThan(1);
  });

  it('hard difficulty aims tighter and throws at least as often as easy', () => {
    const easy = createHarness('easy', 1);
    const easyEnemy = easy.world.addPlayer(Team.Enemy, 0, 0);
    const easyTarget = easy.world.addPlayer(Team.Player, 5, 0.8);
    easy.aiSystem.update(DT);

    const hard = createHarness('hard', 1);
    const hardEnemy = hard.world.addPlayer(Team.Enemy, 0, 0);
    const hardTarget = hard.world.addPlayer(Team.Player, 5, 0.8);
    hard.aiSystem.update(DT);

    expect(easy.thrownEvents.some((event) => event.ownerId === easyEnemy.id)).toBe(true);
    expect(hard.thrownEvents.some((event) => event.ownerId === hardEnemy.id)).toBe(true);
    expect(aimError(firstEnemySnowball(hard.world), hardTarget.position.x, hardTarget.position.y)).toBeLessThanOrEqual(
      aimError(firstEnemySnowball(easy.world), easyTarget.position.x, easyTarget.position.y),
    );
    expect(countEnemyThrows('hard', 19)).toBeGreaterThanOrEqual(countEnemyThrows('easy', 19));
  });

  it('focuses fire on a low-health exposed player', () => {
    const { world, aiSystem, throwSystem } = createHarness('normal', 2468);
    world.addPlayer(Team.Enemy, 0, -0.8);
    world.addPlayer(Team.Enemy, 0, 0.8);
    const lowHealth = world.addPlayer(Team.Player, 6, 1);
    lowHealth.health = 20;
    const healthy = world.addPlayer(Team.Player, 5.5, -1.2);

    step(aiSystem, throwSystem, 5);

    const enemySnowballs = world.snowballs.filter((snowball) => snowball.alive && snowball.team === Team.Enemy);
    expect(enemySnowballs.length).toBeGreaterThanOrEqual(2);
    const lowTargeted = enemySnowballs.filter(
      (snowball) =>
        aimError(snowball, lowHealth.position.x, lowHealth.position.y) <
        aimError(snowball, healthy.position.x, healthy.position.y),
    ).length;
    expect(lowTargeted).toBeGreaterThanOrEqual(2);
  });

  it('easy enemies stay exposed instead of hiding behind cover', () => {
    const arena = createEmptyArena();
    arena.obstacles.push(createObstacle(1, { type: 'rock', x: 9, y: 0, radius: 1.2 }));
    const world = new World(arena, 7);
    const events = new EventBus();
    const throwSystem = new ThrowSystem(world, events);
    const ai = new AISystem(world, events, throwSystem, 'easy');
    const enemy = world.addPlayer(Team.Enemy, 5, 0);
    enemy.throwCooldown = 5; // cannot attack this tick -> a cover-seeker would hide
    const player = world.addPlayer(Team.Player, 0, 0);

    ai.update(DT);

    const startDistance = enemy.position.distanceTo(player.position);
    const targetDistance = enemy.moveTarget
      ? enemy.moveTarget.distanceTo(player.position)
      : startDistance;
    expect(targetDistance).toBeLessThanOrEqual(startDistance + 1e-6);
  });

  it('normal enemies seek cover when they cannot attack', () => {
    const arena = createEmptyArena();
    arena.obstacles.push(createObstacle(1, { type: 'rock', x: 9, y: 0, radius: 1.2 }));
    const world = new World(arena, 7);
    const events = new EventBus();
    const throwSystem = new ThrowSystem(world, events);
    const ai = new AISystem(world, events, throwSystem, 'normal');
    const enemy = world.addPlayer(Team.Enemy, 5, 0);
    enemy.throwCooldown = 5;
    const player = world.addPlayer(Team.Player, 0, 0);

    ai.update(DT);

    expect(enemy.moveTarget).not.toBeNull();
    const startDistance = enemy.position.distanceTo(player.position);
    const targetDistance = (enemy.moveTarget as NonNullable<typeof enemy.moveTarget>).distanceTo(
      player.position,
    );
    expect(targetDistance).toBeGreaterThan(startDistance);
  });
});
