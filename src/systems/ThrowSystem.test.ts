import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../core/events';
import { EventBus } from '../core/EventBus';
import { createEmptyArena } from '../game/Arena';
import { THROW } from '../game/config';
import { PlayerState, Team } from '../game/types';
import { World } from '../game/World';
import { ThrowSystem } from './ThrowSystem';

const DT = 1 / 60;

function step(system: ThrowSystem, count: number): void {
  for (let i = 0; i < count; i++) {
    system.update(DT);
  }
}

function createHarness(): {
  world: World;
  events: EventBus;
  system: ThrowSystem;
  thrownEvents: GameEvents['SnowballThrown'][];
} {
  const world = new World(createEmptyArena(), 1);
  const events = new EventBus();
  const system = new ThrowSystem(world, events);
  const thrownEvents: GameEvents['SnowballThrown'][] = [];

  events.on('SnowballThrown', (event) => {
    thrownEvents.push(event);
  });

  return { world, events, system, thrownEvents };
}

describe('ThrowSystem', () => {
  it('starts a selected player charge and grows charge over updates', () => {
    const { world, system } = createHarness();
    const player = world.addPlayer(Team.Player, 0, 0);
    player.selected = true;

    system.handleCommand({ type: 'ChargeStart', x: 4, y: 0 });
    step(system, 10);

    expect(player.state).toBe(PlayerState.PreparingThrow);
    expect(player.throwCharge).toBeGreaterThan(0);
    expect(player.throwCharge).toBeLessThanOrEqual(1);
    expect(player.aimDirection.x).toBeCloseTo(1);
    expect(player.aimDirection.y).toBeCloseTo(0);
    expect(player.rotation).toBeCloseTo(0);
  });

  it('releases exactly one snowball, emits an event, and blocks immediate cooldown throws', () => {
    const { world, system, thrownEvents } = createHarness();
    const player = world.addPlayer(Team.Player, 0, 0);
    player.selected = true;

    system.handleCommand({ type: 'ChargeStart', x: 5, y: 0 });
    step(system, 30);
    system.handleCommand({ type: 'ChargeRelease', x: 5, y: 0 });

    expect(world.snowballs).toHaveLength(1);
    expect(world.snowballs[0].ownerId).toBe(player.id);
    expect(world.snowballs[0].team).toBe(Team.Player);
    expect(thrownEvents).toEqual([
      { snowballId: world.snowballs[0].id, ownerId: player.id, team: Team.Player },
    ]);
    expect(player.state).toBe(PlayerState.Throwing);

    expect(system.tryThrow(player, 5, 0, 1)).toBe(false);
    expect(world.snowballs).toHaveLength(1);
    expect(thrownEvents).toHaveLength(1);
  });

  it('returns false when trying to throw with an incapacitated unit', () => {
    const { world, system } = createHarness();
    const player = world.addPlayer(Team.Player, 0, 0);
    player.state = PlayerState.Frozen;

    expect(system.tryThrow(player, 3, 0, 1)).toBe(false);
    expect(world.snowballs).toHaveLength(0);
  });

  it('returns the player to idle after windup and recovery elapse', () => {
    const { world, system } = createHarness();
    const player = world.addPlayer(Team.Player, 0, 0);
    player.selected = true;

    system.handleCommand({ type: 'ChargeStart', x: 5, y: 0 });
    system.handleCommand({ type: 'ChargeRelease', x: 5, y: 0 });
    step(system, Math.ceil((THROW.windup + THROW.recovery) / DT) + 2);

    expect(player.state).toBe(PlayerState.Idle);
    expect(player.throwTimer).toBe(0);
  });

  it('freezes aim while the cursor stays within the deadzone', () => {
    const { world, system } = createHarness();
    const player = world.addPlayer(Team.Player, 0, 0);
    player.selected = true;
    player.rotation = Math.PI / 2; // facing "up" before charging

    system.handleCommand({ type: 'ChargeStart', x: 0.3, y: 0 }); // inside the deadzone
    step(system, 20);

    expect(player.rotation).toBeCloseTo(Math.PI / 2);
    expect(player.aimDirection.x).toBeCloseTo(0);
    expect(player.aimDirection.y).toBeCloseTo(1);
  });

  it('rotates toward a new aim over several steps instead of snapping', () => {
    const { world, system } = createHarness();
    const player = world.addPlayer(Team.Player, 0, 0);
    player.selected = true;

    system.handleCommand({ type: 'ChargeStart', x: 5, y: 0 }); // snaps to face +x
    system.update(DT);
    expect(player.rotation).toBeCloseTo(0);

    system.handleCommand({ type: 'ChargeAim', x: 0, y: 5 }); // re-aim straight up
    step(system, 3);
    const partial = player.rotation;
    expect(partial).toBeGreaterThan(0.1);
    expect(partial).toBeLessThan(Math.PI / 2 - 0.1);

    step(system, 30);
    expect(player.rotation).toBeCloseTo(Math.PI / 2, 1);
  });

  it('throws along the smoothed facing, not the raw release cursor', () => {
    const { world, system } = createHarness();
    const player = world.addPlayer(Team.Player, 0, 0);
    player.selected = true;

    system.handleCommand({ type: 'ChargeStart', x: 5, y: 0 }); // faces +x
    system.handleCommand({ type: 'ChargeAim', x: 0, y: 5 }); // steer upward
    step(system, 4);
    // Release with the cursor snapped back to +x: the shot must follow facing.
    system.handleCommand({ type: 'ChargeRelease', x: 5, y: 0 });

    expect(world.snowballs).toHaveLength(1);
    const velocity = world.snowballs[0].velocity;
    expect(velocity.y).toBeGreaterThan(0.5); // clearly upward => smoothed aim, not raw cursor
    expect(velocity.x).toBeGreaterThan(0);
  });

  it('charges to full power and holds it while aiming', () => {
    const { world, system } = createHarness();
    const player = world.addPlayer(Team.Player, 0, 0);
    player.selected = true;

    system.handleCommand({ type: 'ChargeStart', x: 5, y: 0 });
    step(system, Math.ceil((THROW.chargeTime / DT) * 2)); // hold well past full charge

    expect(player.state).toBe(PlayerState.PreparingThrow);
    expect(player.throwCharge).toBe(1);

    step(system, 120); // keep holding: must stay pinned at max, not wrap or decay
    expect(player.throwCharge).toBe(1);
  });
});
