import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createEmptyArena } from '../game/Arena';
import { DAMAGE, ENEMY, PLAYER } from '../game/config';
import { PlayerState, Team } from '../game/types';
import { World } from '../game/World';
import { DamageSystem } from './DamageSystem';

const DT = 1 / 60;

function step(system: DamageSystem, count: number): void {
  for (let i = 0; i < count; i++) {
    system.update(DT);
  }
}

describe('DamageSystem', () => {
  it('applies damage, stun, and knockback away from the impact point', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    new DamageSystem(world, events);
    const player = world.addPlayer(Team.Player, 0, 0);

    events.emit('PlayerHit', {
      playerId: player.id,
      attackerId: 999,
      damage: 25,
      x: -1,
      y: 0,
    });

    expect(player.health).toBe(PLAYER.maxHealth - 25);
    expect(player.state).toBe(PlayerState.Hit);
    expect(player.stunTimer).toBe(DAMAGE.stun);
    expect(player.velocity.x).toBeGreaterThan(0);
    expect(player.velocity.y).toBeCloseTo(0);
    expect(player.velocity.length()).toBeCloseTo(DAMAGE.knockback);
  });

  it('defeats players at zero health and emits PlayerDefeated', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    new DamageSystem(world, events);
    const player = world.addPlayer(Team.Player, 0, 0);
    const defeated: GameEvents['PlayerDefeated'][] = [];
    events.on('PlayerDefeated', (event) => defeated.push(event));

    events.emit('PlayerHit', {
      playerId: player.id,
      attackerId: 999,
      damage: PLAYER.maxHealth,
      x: -1,
      y: 0,
    });

    expect(player.health).toBe(0);
    expect(player.alive).toBe(false);
    expect(player.state).toBe(PlayerState.Defeated);
    expect(player.velocity.length()).toBeCloseTo(0);
    expect(defeated).toEqual([{ playerId: player.id, team: player.team }]);
  });

  it('slides stunned players briefly, damps knockback, and recovers to Idle', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    const damage = new DamageSystem(world, events);
    const player = world.addPlayer(Team.Player, 0, 0);

    events.emit('PlayerHit', {
      playerId: player.id,
      attackerId: 999,
      damage: 10,
      x: -1,
      y: 0,
    });

    const initialSpeed = player.velocity.length();
    step(damage, Math.ceil(DAMAGE.stun / DT) + 1);

    expect(player.state).toBe(PlayerState.Idle);
    expect(player.stunTimer).toBe(0);
    expect(player.position.x).toBeGreaterThan(0);
    expect(player.velocity.length()).toBeLessThan(initialSpeed);
    expect(player.velocity.length()).toBeCloseTo(0);
  });

  it('unsubscribes from PlayerHit on dispose', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    const damage = new DamageSystem(world, events);
    const player = world.addPlayer(Team.Player, 0, 0);

    damage.dispose();
    events.emit('PlayerHit', {
      playerId: player.id,
      attackerId: 999,
      damage: 25,
      x: -1,
      y: 0,
    });

    expect(player.health).toBe(PLAYER.maxHealth);
    expect(player.state).toBe(PlayerState.Idle);
    expect(player.velocity.length()).toBeCloseTo(0);
  });

  it('does not interrupt a friendly unit that is charging a throw', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    new DamageSystem(world, events);
    const player = world.addPlayer(Team.Player, 0, 0);
    player.state = PlayerState.PreparingThrow;
    player.throwCharge = 0.5;

    events.emit('PlayerHit', { playerId: player.id, attackerId: 999, damage: 25, x: -1, y: 0 });

    expect(player.health).toBe(PLAYER.maxHealth - 25); // damage still lands
    expect(player.state).toBe(PlayerState.PreparingThrow); // throw continues
    expect(player.stunTimer).toBe(0); // no stun
    expect(player.velocity.length()).toBeCloseTo(0); // no knockback
    expect(player.throwCharge).toBe(0.5); // charge preserved
  });

  it('still interrupts an enemy unit that is charging a throw', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    new DamageSystem(world, events);
    const enemy = world.addPlayer(Team.Enemy, 0, 0);
    enemy.state = PlayerState.PreparingThrow;

    events.emit('PlayerHit', { playerId: enemy.id, attackerId: 999, damage: 25, x: -1, y: 0 });

    expect(enemy.state).toBe(PlayerState.Hit);
    expect(enemy.stunTimer).toBeCloseTo(DAMAGE.stun * ENEMY.hitStunScale);
    expect(enemy.velocity.length()).toBeCloseTo(DAMAGE.knockback * ENEMY.knockbackScale);
  });

  it('still defeats a charging friendly unit on a lethal hit', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    new DamageSystem(world, events);
    const player = world.addPlayer(Team.Player, 0, 0);
    player.state = PlayerState.PreparingThrow;

    events.emit('PlayerHit', {
      playerId: player.id,
      attackerId: 999,
      damage: PLAYER.maxHealth,
      x: -1,
      y: 0,
    });

    expect(player.alive).toBe(false);
    expect(player.state).toBe(PlayerState.Defeated);
  });

  it('gives enemies a longer stun and stronger knockback', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    new DamageSystem(world, events);
    const enemy = world.addPlayer(Team.Enemy, 0, 0);

    events.emit('PlayerHit', { playerId: enemy.id, attackerId: 999, damage: 10, x: -1, y: 0 });

    expect(enemy.stunTimer).toBeCloseTo(DAMAGE.stun * ENEMY.hitStunScale);
    expect(enemy.velocity.length()).toBeCloseTo(DAMAGE.knockback * ENEMY.knockbackScale);
  });

  it('ignores hits entirely while immune', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    new DamageSystem(world, events);
    const player = world.addPlayer(Team.Player, 0, 0);
    player.immunityTimer = 3;

    events.emit('PlayerHit', { playerId: player.id, attackerId: 999, damage: 25, x: -1, y: 0 });

    expect(player.health).toBe(PLAYER.maxHealth);
    expect(player.state).toBe(PlayerState.Idle);
    expect(player.stunTimer).toBe(0);
    expect(player.velocity.length()).toBeCloseTo(0);
  });
});
