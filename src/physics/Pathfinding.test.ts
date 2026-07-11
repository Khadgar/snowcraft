import { describe, expect, it } from 'vitest';
import { createEmptyArena } from '../game/Arena';
import { createObstacle } from '../game/Obstacle';
import { PathGrid } from './Pathfinding';

describe('PathGrid', () => {
  it('returns a short direct path across empty ground', () => {
    const grid = new PathGrid(createEmptyArena(12, 8));

    const path = grid.findPath(-4, 0, 4, 0);

    expect(path).not.toBeNull();
    expect(path?.length).toBeLessThanOrEqual(2);
    expect(path?.at(-1)?.x).toBeCloseTo(4);
    expect(path?.at(-1)?.y).toBeCloseTo(0);
  });

  it('routes around a blocking wall and keeps waypoints in free space', () => {
    const arena = createEmptyArena(12, 8);
    arena.obstacles.push(createObstacle(1, { type: 'fence', x: 0, y: 0, width: 1, height: 5 }));
    const grid = new PathGrid(arena);

    const path = grid.findPath(-4, 0, 4, 0);

    expect(path).not.toBeNull();
    expect(path?.length).toBeGreaterThan(1);
    for (const waypoint of path ?? []) {
      expect(grid.isBlocked(waypoint.x, waypoint.y)).toBe(false);
    }
    expect(path?.some((waypoint) => Math.abs(waypoint.y) > 2.5)).toBe(true);
    expect(path?.at(-1)?.x).toBeCloseTo(4);
    expect(path?.at(-1)?.y).toBeCloseTo(0);
  });

  it('returns null when a free goal is fully enclosed by blockers', () => {
    const arena = createEmptyArena(12, 12);
    arena.obstacles.push(
      createObstacle(1, { type: 'fence', x: 0, y: 2, width: 5, height: 1 }),
      createObstacle(2, { type: 'fence', x: 0, y: -2, width: 5, height: 1 }),
      createObstacle(3, { type: 'fence', x: 2, y: 0, width: 1, height: 5 }),
      createObstacle(4, { type: 'fence', x: -2, y: 0, width: 1, height: 5 }),
    );
    const grid = new PathGrid(arena);

    expect(grid.isBlocked(0, 0)).toBe(false);
    expect(grid.findPath(-5, 0, 0, 0)).toBeNull();
  });
});
