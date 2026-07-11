import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { ThrowSystem } from '../systems/ThrowSystem';
import { createEmptyArena } from './Arena';
import { SIM, THROW } from './config';
import {
  computeThrowKinematics,
  sampleThrowTrajectory,
  throwSpawnDistance,
  type TrajectoryPoint,
} from './trajectory';
import { Team } from './types';
import { World } from './World';

describe('computeThrowKinematics', () => {
  it('interpolates speed and arc across the charge range', () => {
    expect(computeThrowKinematics(0)).toEqual({
      speed: THROW.minSpeed,
      arc: THROW.launchArc * 0.6,
    });
    expect(computeThrowKinematics(1)).toEqual({
      speed: THROW.maxSpeed,
      arc: THROW.launchArc,
    });

    const mid = computeThrowKinematics(0.5);
    expect(mid.speed).toBeCloseTo((THROW.minSpeed + THROW.maxSpeed) / 2, 6);
    expect(mid.arc).toBeCloseTo(THROW.launchArc * 0.8, 6);
  });

  it('clamps out-of-range charge', () => {
    expect(computeThrowKinematics(-1)).toEqual(computeThrowKinematics(0));
    expect(computeThrowKinematics(5)).toEqual(computeThrowKinematics(1));
  });
});

describe('sampleThrowTrajectory', () => {
  it('starts at the spawn offset and launch height and lands on the ground', () => {
    const out: TrajectoryPoint[] = [];
    const count = sampleThrowTrajectory(0, 0, 1, 0, 0.6, out);

    expect(count).toBeGreaterThan(2);
    expect(out[0].x).toBeCloseTo(throwSpawnDistance(), 6);
    expect(out[0].y).toBeCloseTo(0, 6);
    expect(out[0].height).toBeCloseTo(THROW.launchHeight, 6);
    expect(out[count - 1].height).toBe(0);
  });

  it('arcs above the launch height before descending', () => {
    const out: TrajectoryPoint[] = [];
    const count = sampleThrowTrajectory(0, 0, 1, 0, 1, out);

    const peak = Math.max(...out.slice(0, count).map((p) => p.height));
    expect(peak).toBeGreaterThan(THROW.launchHeight);
  });

  it('throws farther with more charge', () => {
    const weak: TrajectoryPoint[] = [];
    const strong: TrajectoryPoint[] = [];
    const weakCount = sampleThrowTrajectory(0, 0, 1, 0, 0.2, weak);
    const strongCount = sampleThrowTrajectory(0, 0, 1, 0, 1, strong);

    expect(strong[strongCount - 1].x).toBeGreaterThan(weak[weakCount - 1].x);
  });

  it('returns no points for a zero-length direction', () => {
    const out: TrajectoryPoint[] = [];
    expect(sampleThrowTrajectory(0, 0, 0, 0, 1, out)).toBe(0);
  });

  it('reuses the output array in place without growing it', () => {
    const out: TrajectoryPoint[] = [];
    const first = sampleThrowTrajectory(0, 0, 1, 0, 1, out);
    const firstRef = out[0];
    const second = sampleThrowTrajectory(0, 0, 1, 0, 0.2, out);

    expect(second).toBeLessThanOrEqual(first);
    expect(out[0]).toBe(firstRef); // same object reused, not reallocated
  });

  it('predicts the same landing spot the real snowball reaches', () => {
    const charge = 0.7;
    const world = new World(createEmptyArena(), 123);
    const events = new EventBus();
    const throwSystem = new ThrowSystem(world, events);
    const projectile = new ProjectileSystem(world, events);
    const player = world.addPlayer(Team.Player, 0, 0);

    expect(throwSystem.tryThrow(player, 10, 0, charge)).toBe(true);
    const snowball = world.snowballs[0];
    expect(snowball).toBeDefined();

    for (let i = 0; i < 600 && snowball.alive; i++) {
      projectile.update(SIM.dt);
    }
    expect(snowball.alive).toBe(false);

    const out: TrajectoryPoint[] = [];
    const count = sampleThrowTrajectory(0, 0, 1, 0, charge, out);
    const predicted = out[count - 1];

    expect(predicted.x).toBeCloseTo(snowball.position.x, 5);
    expect(predicted.y).toBeCloseTo(snowball.position.y, 5);
  });
});
