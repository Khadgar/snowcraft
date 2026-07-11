import { describe, expect, it } from 'vitest';
import { createEmptyArena } from '../game/Arena';
import { ENEMY, PLAYER } from '../game/config';
import { createObstacle } from '../game/Obstacle';
import { PlayerState, Team } from '../game/types';
import { World } from '../game/World';
import { Vector2 } from '../utils/Vector2';
import { computeCircleRectPushout, computeDesiredVelocity, maxSpeedFor, MovementSystem } from './MovementSystem';

const DT = 1 / 60;

function step(system: MovementSystem, count: number): void {
  for (let i = 0; i < count; i++) {
    system.update(DT);
  }
}

describe('MovementSystem', () => {
  it('moves a unit toward its move target and arrives idle', () => {
    const world = new World(createEmptyArena(), 1);
    const movement = new MovementSystem(world);
    const player = world.addPlayer(Team.Player, 0, 0);
    player.selected = true;

    movement.handleCommand({ type: 'MoveUnits', x: 3, y: 0 });
    step(movement, 180);

    expect(player.moveTarget).toBeNull();
    expect(player.state).toBe(PlayerState.Idle);
    expect(player.velocity.length()).toBeCloseTo(0);
    expect(player.position.x).toBeCloseTo(3, 1);
    expect(player.position.y).toBeCloseTo(0, 1);
  });

  it('keeps two units issued the same click spaced apart', () => {
    const world = new World(createEmptyArena(), 1);
    const movement = new MovementSystem(world);
    const first = world.addPlayer(Team.Player, -2, 0);
    const second = world.addPlayer(Team.Player, -2, 0.2);
    first.selected = true;
    second.selected = true;

    movement.handleCommand({ type: 'MoveUnits', x: 2, y: 0 });
    step(movement, 240);

    expect(Vector2.distance(first.position, second.position)).toBeGreaterThanOrEqual(
      first.radius + second.radius - 0.001,
    );
  });

  it('pushes a moving unit out of blocking circle obstacles', () => {
    const arena = createEmptyArena();
    arena.obstacles.push(createObstacle(100, { type: 'rock', x: 0, y: 0, radius: 1 }));
    const world = new World(arena, 1);
    const movement = new MovementSystem(world);
    const player = world.addPlayer(Team.Player, -3, 0);
    player.selected = true;

    movement.handleCommand({ type: 'MoveUnits', x: 3, y: 0 });
    step(movement, 180);

    expect(player.position.distanceTo(arena.obstacles[0].position)).toBeGreaterThanOrEqual(1 + player.radius - 0.001);
  });

  it('clamps units inside arena bounds', () => {
    const world = new World(createEmptyArena(6, 6), 1);
    const movement = new MovementSystem(world);
    const player = world.addPlayer(Team.Player, 0, 0);
    player.selected = true;

    movement.handleCommand({ type: 'MoveUnits', x: 100, y: 100 });
    step(movement, 240);

    const limit = 3 - player.radius;
    expect(player.position.x).toBeLessThanOrEqual(limit);
    expect(player.position.y).toBeLessThanOrEqual(limit);
    expect(player.position.x).toBeGreaterThanOrEqual(-limit);
    expect(player.position.y).toBeGreaterThanOrEqual(-limit);
  });

  it('moves the enemy squad slower than the player squad', () => {
    const world = new World(createEmptyArena(), 1);
    const movement = new MovementSystem(world);
    const player = world.addPlayer(Team.Player, 0, 3);
    const enemy = world.addPlayer(Team.Enemy, 0, -3);
    player.moveTarget = new Vector2(15, 3);
    enemy.moveTarget = new Vector2(15, -3);

    step(movement, 120);

    expect(maxSpeedFor(player)).toBe(PLAYER.moveSpeed);
    expect(maxSpeedFor(enemy)).toBeCloseTo(PLAYER.moveSpeed * ENEMY.moveSpeedScale);
    expect(enemy.velocity.length()).toBeLessThan(player.velocity.length());
    expect(player.velocity.length()).toBeCloseTo(PLAYER.moveSpeed, 1);
    expect(enemy.velocity.length()).toBeCloseTo(PLAYER.moveSpeed * ENEMY.moveSpeedScale, 1);
  });

  it('steers a selected unit with keyboard axis input and stops on release', () => {
    const world = new World(createEmptyArena(), 1);
    const movement = new MovementSystem(world);
    const player = world.addPlayer(Team.Player, 0, 0);
    player.selected = true;

    movement.handleCommand({ type: 'MoveAxis', x: 1, y: 0 });
    step(movement, 30);

    expect(player.position.x).toBeGreaterThan(0.5);
    expect(player.position.y).toBeCloseTo(0, 1);
    expect(player.velocity.length()).toBeGreaterThan(0);

    movement.handleCommand({ type: 'MoveAxis', x: 0, y: 0 });
    step(movement, 5);

    expect(player.velocity.length()).toBeCloseTo(0);
    expect(player.state).toBe(PlayerState.Idle);
  });

  it('does not keyboard-steer unselected or enemy units', () => {
    const world = new World(createEmptyArena(), 1);
    const movement = new MovementSystem(world);
    const idle = world.addPlayer(Team.Player, 0, 0); // not selected
    const enemy = world.addPlayer(Team.Enemy, 3, 0);
    enemy.selected = true; // enemies are never player-steerable

    movement.handleCommand({ type: 'MoveAxis', x: 1, y: 0 });
    step(movement, 20);

    expect(idle.position.x).toBeCloseTo(0);
    expect(enemy.position.x).toBeCloseTo(3);
  });

  it('exposes pure steering and circle-rect pushout helpers', () => {
    const desired = computeDesiredVelocity(0, 0, 10, 0, PLAYER.moveSpeed, PLAYER.spacing, new Vector2());
    const push = computeCircleRectPushout(0, 0, 0.5, { kind: 'rect', x: 0, y: 0, halfW: 1, halfH: 1 }, new Vector2());

    expect(desired.x).toBeCloseTo(PLAYER.moveSpeed);
    expect(desired.y).toBeCloseTo(0);
    expect(push.length()).toBeGreaterThan(0);
  });
});
