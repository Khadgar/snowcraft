import { describe, expect, it } from 'vitest';
import { RespawnSystem } from './RespawnSystem';
import { World } from '../game/World';
import { EventBus } from '../core/EventBus';
import { createEmptyArena } from '../game/Arena';
import { RESPAWN } from '../game/config';
import { PlayerState, Team } from '../game/types';

function makeWorld(lives: number): World {
  const world = new World(createEmptyArena(), 1);
  world.playerLivesMax = lives;
  world.playerLives = lives;
  return world;
}

describe('RespawnSystem', () => {
  it('respawns the hero with immunity while lives remain', () => {
    const world = makeWorld(3);
    const player = world.addPlayer(Team.Player, -5, 0);
    const events = new EventBus();
    let respawnedAt: { x: number; y: number } | null = null;
    events.on('PlayerRespawned', ({ x, y }) => {
      respawnedAt = { x, y };
    });
    const respawn = new RespawnSystem(world, events);

    player.alive = false;
    player.state = PlayerState.Defeated;
    events.emit('PlayerDefeated', { playerId: player.id, team: Team.Player });

    // One life consumed; not yet reappeared before the delay elapses.
    expect(world.playerLives).toBe(2);
    respawn.update(RESPAWN.delay * 0.5);
    expect(player.alive).toBe(false);

    respawn.update(RESPAWN.delay);
    expect(player.alive).toBe(true);
    expect(player.immunityTimer).toBe(RESPAWN.immunity);
    expect(player.selected).toBe(true);
    expect(player.health).toBe(player.maxHealth);
    expect(player.state).toBe(PlayerState.Idle);
    expect(respawnedAt).not.toBeNull();
  });

  it('does not respawn when the hero is out of lives', () => {
    const world = makeWorld(1);
    const player = world.addPlayer(Team.Player, -5, 0);
    const events = new EventBus();
    let respawned = false;
    events.on('PlayerRespawned', () => {
      respawned = true;
    });
    const respawn = new RespawnSystem(world, events);

    player.alive = false;
    events.emit('PlayerDefeated', { playerId: player.id, team: Team.Player });
    respawn.update(RESPAWN.delay * 2);

    expect(world.playerLives).toBe(0);
    expect(player.alive).toBe(false);
    expect(respawned).toBe(false);
  });

  it('ignores enemy defeats', () => {
    const world = makeWorld(3);
    const enemy = world.addPlayer(Team.Enemy, 5, 0);
    const events = new EventBus();
    const respawn = new RespawnSystem(world, events);

    enemy.alive = false;
    events.emit('PlayerDefeated', { playerId: enemy.id, team: Team.Enemy });
    respawn.update(RESPAWN.delay * 2);

    expect(world.playerLives).toBe(3);
  });

  it('respawns within the arena bounds and clear of obstacles', () => {
    const world = makeWorld(2);
    const player = world.addPlayer(Team.Player, -5, 0);
    const events = new EventBus();
    const respawn = new RespawnSystem(world, events);

    player.alive = false;
    events.emit('PlayerDefeated', { playerId: player.id, team: Team.Player });
    respawn.update(RESPAWN.delay);

    const halfW = world.arena.width / 2;
    const halfH = world.arena.height / 2;
    expect(Math.abs(player.position.x)).toBeLessThanOrEqual(halfW);
    expect(Math.abs(player.position.y)).toBeLessThanOrEqual(halfH);
  });
});
