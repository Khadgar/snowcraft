import { describe, expect, it } from 'vitest';
import { createEmptyArena } from '../game/Arena';
import { createObstacle } from '../game/Obstacle';
import {
  findCoverSpot,
  firstSightBlocker,
  hasLineOfSight,
  isProjectilePathBlocked,
} from './LineOfSight';

describe('line of sight', () => {
  it('is clear across empty ground', () => {
    const arena = createEmptyArena();

    expect(hasLineOfSight(arena, -5, 0, 5, 0)).toBe(true);
    expect(firstSightBlocker(arena, -5, 0, 5, 0)).toBeNull();
  });

  it('is blocked by a sight-blocking obstacle between two points', () => {
    const arena = createEmptyArena();
    const rock = createObstacle(100, { type: 'rock', x: 0, y: 0, radius: 1 });
    arena.obstacles.push(rock);

    expect(rock.blocksSight).toBe(true);
    expect(hasLineOfSight(arena, -5, 0, 5, 0)).toBe(false);
    expect(firstSightBlocker(arena, -5, 0, 5, 0)).toBe(rock);
  });

  it('lets fences preserve sight while still blocking projectile paths', () => {
    const arena = createEmptyArena();
    const fence = createObstacle(101, { type: 'fence', x: 0, y: 0, width: 2, height: 0.24 });
    arena.obstacles.push(fence);

    expect(fence.blocksSight).toBe(false);
    expect(fence.blocksProjectiles).toBe(true);
    expect(hasLineOfSight(arena, -5, 0, 5, 0)).toBe(true);
    expect(isProjectilePathBlocked(arena, -5, 0, 5, 0)).toBe(true);
  });

  it('finds a nearby cover spot on the far side from the threat', () => {
    const arena = createEmptyArena();
    arena.obstacles.push(createObstacle(102, { type: 'rock', x: 0, y: 0, radius: 1 }));

    const cover = findCoverSpot(arena, -5, 0, 1, 0, 0.35);

    expect(cover).not.toBeNull();
    expect(cover?.x).toBeGreaterThan(0);
    expect(cover?.y).toBeCloseTo(0);
    expect(hasLineOfSight(arena, cover?.x ?? 0, cover?.y ?? 0, -5, 0)).toBe(false);
  });
});
