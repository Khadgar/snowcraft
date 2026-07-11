import type { Arena } from '../game/types';
import { PLAYER } from '../game/config';
import { pointInShape } from './Collision';
import { shapeBounds, type Shape } from './shapes';

export interface PathWaypoint {
  x: number;
  y: number;
}

interface GridCell {
  x: number;
  y: number;
}

class MinHeap {
  private readonly items: number[] = [];

  constructor(private readonly scores: Float64Array) {}

  get length(): number {
    return this.items.length;
  }

  push(value: number): void {
    this.items.push(value);
    this.siftUp(this.items.length - 1);
  }

  pop(): number {
    const first = this.items[0];
    const last = this.items.pop();
    if (last !== undefined && this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return first;
  }

  private siftUp(index: number): void {
    let child = index;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (this.scores[this.items[parent]] <= this.scores[this.items[child]]) break;
      this.swap(parent, child);
      child = parent;
    }
  }

  private siftDown(index: number): void {
    let parent = index;
    while (true) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let best = parent;

      if (left < this.items.length && this.scores[this.items[left]] < this.scores[this.items[best]]) {
        best = left;
      }
      if (right < this.items.length && this.scores[this.items[right]] < this.scores[this.items[best]]) {
        best = right;
      }
      if (best === parent) break;

      this.swap(parent, best);
      parent = best;
    }
  }

  private swap(a: number, b: number): void {
    const item = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = item;
  }
}

/** Coarse 8-way A* grid over the static arena movement blockers. */
export class PathGrid {
  private readonly columns: number;
  private readonly rows: number;
  private readonly minX: number;
  private readonly minY: number;
  private readonly blocked: Uint8Array;

  constructor(
    private readonly arena: Arena,
    private readonly cellSize = 1,
    private readonly inflate = PLAYER.radius,
  ) {
    this.columns = Math.max(1, Math.ceil(arena.width / cellSize));
    this.rows = Math.max(1, Math.ceil(arena.height / cellSize));
    this.minX = -arena.width / 2;
    this.minY = -arena.height / 2;
    this.blocked = new Uint8Array(this.columns * this.rows);
    this.buildBlockedGrid();
  }

  /** A* path from start to goal as world-space waypoints excluding start, or null if unreachable. */
  findPath(sx: number, sy: number, gx: number, gy: number): PathWaypoint[] | null {
    const start = this.nearestFreeCell(sx, sy);
    const goal = this.nearestFreeCell(gx, gy);
    if (!start || !goal) return null;

    const startIndex = this.index(start.x, start.y);
    const goalIndex = this.index(goal.x, goal.y);
    if (startIndex === goalIndex) {
      return [{ x: gx, y: gy }];
    }

    const count = this.columns * this.rows;
    const gScore = new Float64Array(count);
    const fScore = new Float64Array(count);
    const parent = new Int32Array(count);
    const state = new Uint8Array(count);
    gScore.fill(Number.POSITIVE_INFINITY);
    fScore.fill(Number.POSITIVE_INFINITY);
    parent.fill(-1);

    gScore[startIndex] = 0;
    fScore[startIndex] = this.heuristic(start.x, start.y, goal.x, goal.y);
    const open = new MinHeap(fScore);
    open.push(startIndex);
    state[startIndex] = 1;

    while (open.length > 0) {
      const current = open.pop();
      if (state[current] === 2) continue;
      if (current === goalIndex) {
        return this.reconstructPath(parent, current, goal, gx, gy);
      }

      state[current] = 2;
      const cx = current % this.columns;
      const cy = Math.floor(current / this.columns);

      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          if (!this.canEnter(cx, cy, nx, ny)) continue;

          const neighbor = this.index(nx, ny);
          if (state[neighbor] === 2) continue;

          const stepCost = ox !== 0 && oy !== 0 ? Math.SQRT2 : 1;
          const tentative = gScore[current] + stepCost;
          if (tentative >= gScore[neighbor]) continue;

          parent[neighbor] = current;
          gScore[neighbor] = tentative;
          fScore[neighbor] = tentative + this.heuristic(nx, ny, goal.x, goal.y);
          open.push(neighbor);
          state[neighbor] = 1;
        }
      }
    }

    return null;
  }

  isBlocked(x: number, y: number): boolean {
    const cell = this.worldToCell(x, y);
    return !cell || this.blocked[this.index(cell.x, cell.y)] !== 0;
  }

  private buildBlockedGrid(): void {
    for (const obstacle of this.arena.obstacles) {
      if (!obstacle.blocksMovement) continue;

      const inflated = inflateShape(obstacle.collision, this.inflate);
      const bounds = shapeBounds(inflated);
      const minCell = this.worldToCell(bounds.minX, bounds.minY);
      const maxCell = this.worldToCell(bounds.maxX, bounds.maxY);
      if (!minCell || !maxCell) continue;

      for (let y = minCell.y; y <= maxCell.y; y++) {
        for (let x = minCell.x; x <= maxCell.x; x++) {
          const center = this.cellCenter(x, y);
          if (pointInShape(inflated, center.x, center.y)) {
            this.blocked[this.index(x, y)] = 1;
          }
        }
      }
    }
  }

  private reconstructPath(
    parent: Int32Array,
    goalIndex: number,
    goalCell: GridCell,
    gx: number,
    gy: number,
  ): PathWaypoint[] {
    const reversed: number[] = [];
    let current = goalIndex;
    while (current !== -1) {
      reversed.push(current);
      current = parent[current];
    }

    const waypoints: PathWaypoint[] = [];
    for (let i = reversed.length - 2; i >= 0; i--) {
      const index = reversed[i];
      waypoints.push(this.cellCenter(index % this.columns, Math.floor(index / this.columns)));
    }

    const smoothed = this.dropColinear(waypoints);
    const last = smoothed[smoothed.length - 1];
    const goalWasSnapped = goalCell.x !== this.worldToCellClamped(gx, gy).x || goalCell.y !== this.worldToCellClamped(gx, gy).y;
    if (!goalWasSnapped && last) {
      last.x = gx;
      last.y = gy;
    }
    return smoothed;
  }

  private dropColinear(path: PathWaypoint[]): PathWaypoint[] {
    if (path.length <= 2) return path;

    const result: PathWaypoint[] = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const previous = result[result.length - 1];
      const current = path[i];
      const next = path[i + 1];
      const dx1 = Math.sign(current.x - previous.x);
      const dy1 = Math.sign(current.y - previous.y);
      const dx2 = Math.sign(next.x - current.x);
      const dy2 = Math.sign(next.y - current.y);
      if (dx1 !== dx2 || dy1 !== dy2) {
        result.push(current);
      }
    }
    result.push(path[path.length - 1]);
    return result;
  }

  private nearestFreeCell(x: number, y: number): GridCell | null {
    const origin = this.worldToCellClamped(x, y);
    if (!this.isCellBlocked(origin.x, origin.y)) return origin;

    let best: GridCell | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    const maxRadius = Math.max(this.columns, this.rows);
    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let cy = origin.y - radius; cy <= origin.y + radius; cy++) {
        for (let cx = origin.x - radius; cx <= origin.x + radius; cx++) {
          if (Math.abs(cx - origin.x) !== radius && Math.abs(cy - origin.y) !== radius) continue;
          if (!this.inBounds(cx, cy) || this.isCellBlocked(cx, cy)) continue;

          const center = this.cellCenter(cx, cy);
          const dx = center.x - x;
          const dy = center.y - y;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            best = { x: cx, y: cy };
          }
        }
      }
      if (best) return best;
    }

    return null;
  }

  private canEnter(cx: number, cy: number, nx: number, ny: number): boolean {
    if (!this.inBounds(nx, ny) || this.isCellBlocked(nx, ny)) return false;

    const dx = nx - cx;
    const dy = ny - cy;
    if (dx !== 0 && dy !== 0) {
      return !this.isCellBlocked(cx + dx, cy) && !this.isCellBlocked(cx, cy + dy);
    }

    return true;
  }

  private heuristic(x: number, y: number, gx: number, gy: number): number {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  }

  private worldToCell(x: number, y: number): GridCell | null {
    if (x < this.minX || y < this.minY || x > this.minX + this.arena.width || y > this.minY + this.arena.height) {
      return null;
    }
    return this.worldToCellClamped(x, y);
  }

  private worldToCellClamped(x: number, y: number): GridCell {
    return {
      x: clampIndex(Math.floor((x - this.minX) / this.cellSize), this.columns),
      y: clampIndex(Math.floor((y - this.minY) / this.cellSize), this.rows),
    };
  }

  private cellCenter(x: number, y: number): PathWaypoint {
    return {
      x: this.minX + (x + 0.5) * this.cellSize,
      y: this.minY + (y + 0.5) * this.cellSize,
    };
  }

  private index(x: number, y: number): number {
    return y * this.columns + x;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.columns && y >= 0 && y < this.rows;
  }

  private isCellBlocked(x: number, y: number): boolean {
    return this.blocked[this.index(x, y)] !== 0;
  }
}

function inflateShape(shape: Shape, amount: number): Shape {
  switch (shape.kind) {
    case 'circle':
      return { ...shape, radius: shape.radius + amount };
    case 'rect':
      return { ...shape, halfW: shape.halfW + amount, halfH: shape.halfH + amount };
    case 'capsule':
      return { ...shape, radius: shape.radius + amount };
  }
}

function clampIndex(value: number, size: number): number {
  if (value < 0) return 0;
  if (value >= size) return size - 1;
  return value;
}
