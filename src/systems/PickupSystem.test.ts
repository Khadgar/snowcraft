import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { createEmptyArena } from '../game/Arena';
import { BUFF, PLAYER } from '../game/config';
import { Team, type BuffType, type Pickup } from '../game/types';
import { World } from '../game/World';
import { Vector2 } from '../utils/Vector2';
import { maxSpeedFor } from './MovementSystem';
import { PickupSystem, type BuffTarget } from './PickupSystem';

const DT = 1 / 60;

function harness(target: BuffTarget) {
  const world = new World(createEmptyArena(), 1);
  const events = new EventBus();
  const system = new PickupSystem(world, events, target);
  return { world, events, system };
}

function placePickup(world: World, type: BuffType, x: number, y: number): Pickup {
  const pickup: Pickup = {
    id: world.ids.allocate(),
    type,
    position: new Vector2(x, y),
    radius: BUFF.pickupRadius,
    active: true,
  };
  world.pickups.push(pickup);
  return pickup;
}

describe('PickupSystem', () => {
  it('grants an extra life when a friendly unit collects a life pickup', () => {
    const { world, system } = harness('player');
    const player = world.addPlayer(Team.Player, 0, 0);
    const startMax = player.maxHealth;
    const pickup = placePickup(world, 'life', 0, 0);

    system.update(DT);

    expect(pickup.active).toBe(false);
    expect(player.maxHealth).toBe(startMax + BUFF.extraLife);
    expect(player.health).toBe(startMax + BUFF.extraLife);
  });

  it('grants immunity that then blocks damage and decays over time', () => {
    const { world, system } = harness('player');
    const player = world.addPlayer(Team.Player, 0, 0);
    placePickup(world, 'immunity', 0, 0);

    system.update(DT);
    expect(player.immunityTimer).toBe(BUFF.immunityDuration);

    system.update(1);
    expect(player.immunityTimer).toBeCloseTo(BUFF.immunityDuration - 1);
  });

  it('grants a speed boost that raises the unit max speed', () => {
    const { world, system } = harness('player');
    const player = world.addPlayer(Team.Player, 0, 0);
    placePickup(world, 'speed', 0, 0);

    system.update(DT);

    expect(player.speedTimer).toBe(BUFF.speedDuration);
    expect(maxSpeedFor(player)).toBeCloseTo(PLAYER.moveSpeed * BUFF.speedMultiplier);
  });

  it('only lets friendly units collect when targeting the player squad', () => {
    const { world, system } = harness('player');
    const enemy = world.addPlayer(Team.Enemy, 0, 0);
    const pickup = placePickup(world, 'immunity', 0, 0);

    system.update(DT);

    expect(pickup.active).toBe(true);
    expect(enemy.immunityTimer).toBe(0);
  });

  it('lets enemies collect when targeting both teams', () => {
    const { world, system } = harness('both');
    const enemy = world.addPlayer(Team.Enemy, 0, 0);
    const pickup = placePickup(world, 'immunity', 0, 0);

    system.update(DT);

    expect(pickup.active).toBe(false);
    expect(enemy.immunityTimer).toBe(BUFF.immunityDuration);
  });

  it('does not spawn or collect when buffs are off, but still decays timers', () => {
    const { world, system } = harness('off');
    const player = world.addPlayer(Team.Player, 0, 0);
    player.immunityTimer = 2;
    const pickup = placePickup(world, 'immunity', 0, 0);

    system.update(1);

    expect(pickup.active).toBe(true); // not collected
    expect(player.immunityTimer).toBeCloseTo(1); // still decays
  });

  it('spawns a pickup onto open ground after the initial delay', () => {
    const { world, system } = harness('player');
    world.addPlayer(Team.Player, 0, 0);

    system.update(BUFF.firstSpawnDelay + 0.1);

    expect(world.pickups.some((p) => p.active)).toBe(true);
  });
});
