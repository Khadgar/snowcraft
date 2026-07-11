import { clamp } from '../utils/math';
import type { Arena } from './types';

export function createEmptyArena(width = 40, height = 30): Arena {
  return { width, height, obstacles: [], spawns: [] };
}

/** True when the point lies within the arena rectangle. */
export function arenaContains(arena: Arena, x: number, y: number, margin = 0): boolean {
  const halfW = arena.width / 2 - margin;
  const halfH = arena.height / 2 - margin;
  return x >= -halfW && x <= halfW && y >= -halfH && y <= halfH;
}

/** Clamps a point to stay inside the arena bounds (mutates `out`). */
export function clampToArena(
  arena: Arena,
  x: number,
  y: number,
  margin: number,
  out: { x: number; y: number },
): void {
  const halfW = arena.width / 2 - margin;
  const halfH = arena.height / 2 - margin;
  out.x = clamp(x, -halfW, halfW);
  out.y = clamp(y, -halfH, halfH);
}
