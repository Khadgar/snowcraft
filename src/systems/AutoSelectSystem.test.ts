import { describe, expect, it } from 'vitest';
import { AutoSelectSystem } from './AutoSelectSystem';
import { World } from '../game/World';
import { createEmptyArena } from '../game/Arena';
import { Team } from '../game/types';

function makeWorld(): World {
  return new World(createEmptyArena(), 1);
}

describe('AutoSelectSystem', () => {
  it('keeps the sole living player unit selected', () => {
    const world = makeWorld();
    const player = world.addPlayer(Team.Player, 0, 0);
    const auto = new AutoSelectSystem(world);

    auto.update();
    expect(player.selected).toBe(true);
  });

  it('re-selects the player after selection is cleared (sticky)', () => {
    const world = makeWorld();
    const player = world.addPlayer(Team.Player, 0, 0);
    const auto = new AutoSelectSystem(world);

    player.selected = false;
    auto.update();
    expect(player.selected).toBe(true);
  });

  it('does not select a dead player unit', () => {
    const world = makeWorld();
    const player = world.addPlayer(Team.Player, 0, 0);
    player.alive = false;
    const auto = new AutoSelectSystem(world);

    auto.update();
    expect(player.selected).toBe(false);
  });

  it('never selects enemy units', () => {
    const world = makeWorld();
    const enemy = world.addPlayer(Team.Enemy, 5, 0);
    const auto = new AutoSelectSystem(world);

    auto.update();
    expect(enemy.selected).toBe(false);
  });
});
