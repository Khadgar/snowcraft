import type { Arena, Obstacle } from '../game/types';
import { segmentVsShape } from './Collision';
import { shapeBounds } from './shapes';
import type { Shape } from './shapes';

const COVER_MARGIN = 0.25;
const EPSILON = 1e-9;

/**
 * True if a straight line between two points is not blocked by any
 * sight-blocking obstacle. Uses obstacle collision shapes for the block test.
 */
export function hasLineOfSight(
  arena: Arena,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  return firstSightBlocker(arena, ax, ay, bx, by) === null;
}

/**
 * Returns the first sight-blocking obstacle in arena iteration order, or null
 * when the segment is clear.
 */
export function firstSightBlocker(
  arena: Arena,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Obstacle | null {
  for (const obstacle of arena.obstacles) {
    if (
      obstacle.blocksSight &&
      segmentVsShape(ax, ay, bx, by, obstacle.collision)
    ) {
      return obstacle;
    }
  }

  return null;
}

/**
 * True if a 2D snowball path intersects a projectile-blocking obstacle.
 * Projectile arc height is intentionally ignored for this cheap AI hint.
 */
export function isProjectilePathBlocked(
  arena: Arena,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  for (const obstacle of arena.obstacles) {
    if (
      obstacle.blocksProjectiles &&
      segmentVsShape(ax, ay, bx, by, obstacle.collision)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Finds the closest valid hiding point behind a sight-blocking obstacle,
 * measured from the current unit position.
 */
export function findCoverSpot(
  arena: Arena,
  threatX: number,
  threatY: number,
  searchOriginX: number,
  searchOriginY: number,
  unitRadius: number,
): { x: number; y: number } | null {
  let bestX = 0;
  let bestY = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let found = false;

  for (const obstacle of arena.obstacles) {
    if (!obstacle.blocksSight) {
      continue;
    }

    const center = shapeCenter(obstacle.collision);
    let dirX = center.x - threatX;
    let dirY = center.y - threatY;
    const lenSq = dirX * dirX + dirY * dirY;

    if (lenSq <= EPSILON) {
      dirX = center.x - searchOriginX;
      dirY = center.y - searchOriginY;
    }

    const fallbackLenSq = dirX * dirX + dirY * dirY;
    if (fallbackLenSq <= EPSILON) {
      dirX = 1;
      dirY = 0;
    } else {
      const invLen = 1 / Math.sqrt(fallbackLenSq);
      dirX *= invLen;
      dirY *= invLen;
    }

    const distance = obstacleRadius(obstacle.collision) + unitRadius + COVER_MARGIN;
    const candidateX = center.x + dirX * distance;
    const candidateY = center.y + dirY * distance;

    if (!isInsideArena(arena, candidateX, candidateY, unitRadius)) {
      continue;
    }

    if (hasLineOfSight(arena, candidateX, candidateY, threatX, threatY)) {
      continue;
    }

    const dx = candidateX - searchOriginX;
    const dy = candidateY - searchOriginY;
    const score = dx * dx + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      bestX = candidateX;
      bestY = candidateY;
      found = true;
    }
  }

  return found ? { x: bestX, y: bestY } : null;
}

function shapeCenter(shape: Shape): { x: number; y: number } {
  if (shape.kind === 'capsule') {
    return {
      x: (shape.x1 + shape.x2) / 2,
      y: (shape.y1 + shape.y2) / 2,
    };
  }

  return { x: shape.x, y: shape.y };
}

function obstacleRadius(shape: Shape): number {
  if (shape.kind === 'circle') {
    return shape.radius;
  }

  const bounds = shapeBounds(shape);
  const halfW = (bounds.maxX - bounds.minX) / 2;
  const halfH = (bounds.maxY - bounds.minY) / 2;
  return Math.hypot(halfW, halfH);
}

function isInsideArena(
  arena: Arena,
  x: number,
  y: number,
  margin: number,
): boolean {
  const halfW = arena.width / 2 - margin;
  const halfH = arena.height / 2 - margin;
  return x >= -halfW && x <= halfW && y >= -halfH && y <= halfH;
}
