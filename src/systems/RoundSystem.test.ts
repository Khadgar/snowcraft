import { describe, expect, it } from 'vitest';
import { RoundSystem } from './RoundSystem';
import { World } from '../game/World';
import { EventBus } from '../core/EventBus';
import { createEmptyArena } from '../game/Arena';
import { Team } from '../game/types';

function makeWorld(): World {
  return new World(createEmptyArena(), 1);
}

describe('RoundSystem', () => {
  it('does not end while both squads have survivors', () => {
    const world = makeWorld();
    world.addPlayer(Team.Player, -1, 0);
    world.addPlayer(Team.Enemy, 1, 0);
    const round = new RoundSystem(world, new EventBus());
    round.update();
    expect(round.isOver).toBe(false);
    expect(round.result).toBeNull();
  });

  it('declares the player the winner when enemies are eliminated', () => {
    const world = makeWorld();
    const p = world.addPlayer(Team.Player, -1, 0);
    const e = world.addPlayer(Team.Enemy, 1, 0);
    const events = new EventBus();
    let winner: Team | null = null;
    events.on('RoundEnded', (payload) => {
      winner = payload.winner;
    });
    const round = new RoundSystem(world, events);
    e.alive = false;
    round.update();
    expect(round.isOver).toBe(true);
    expect(round.result).toBe(Team.Player);
    expect(winner).toBe(Team.Player);
    // Idempotent: no second emit.
    p.alive = false;
    round.update();
    expect(round.result).toBe(Team.Player);
  });

  it('declares the enemy the winner when the player squad is eliminated', () => {
    const world = makeWorld();
    world.addPlayer(Team.Player, -1, 0).alive = false;
    world.addPlayer(Team.Enemy, 1, 0);
    const round = new RoundSystem(world, new EventBus());
    round.update();
    expect(round.result).toBe(Team.Enemy);
  });
});
