import type { Command } from '../core/commands';
import type { EventBus } from '../core/EventBus';
import type { World } from '../game/World';
import { Team, type Player } from '../game/types';

const GRAB_TOLERANCE = 0.25;

export function isSelectablePlayer(player: Player): boolean {
  return player.team === Team.Player && player.alive;
}

export function pointInRect(
  x: number,
  y: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  const left = Math.min(minX, maxX);
  const right = Math.max(minX, maxX);
  const top = Math.min(minY, maxY);
  const bottom = Math.max(minY, maxY);

  return x >= left && x <= right && y >= top && y <= bottom;
}

export function findNearestSelectablePlayer(
  players: readonly Player[],
  x: number,
  y: number,
): Player | null {
  let nearest: Player | null = null;
  let nearestDistanceSq = Infinity;

  for (const player of players) {
    if (!isSelectablePlayer(player)) continue;

    const dx = player.position.x - x;
    const dy = player.position.y - y;
    const distanceSq = dx * dx + dy * dy;
    const reach = player.radius + GRAB_TOLERANCE;

    if (distanceSq <= reach * reach && distanceSq < nearestDistanceSq) {
      nearest = player;
      nearestDistanceSq = distanceSq;
    }
  }

  return nearest;
}

/**
 * Applies high-level selection commands to player simulation state.
 */
export class SelectionSystem {
  constructor(
    private readonly world: World,
    private readonly events: EventBus,
  ) {}

  handleCommand(command: Command): void {
    let changed: boolean;

    switch (command.type) {
      case 'SelectAt':
        changed = this.selectAt(command.x, command.y, command.additive);
        break;
      case 'BoxSelect':
        changed = this.boxSelect(
          command.minX,
          command.minY,
          command.maxX,
          command.maxY,
          command.additive,
        );
        break;
      case 'ClearSelection':
        changed = this.clearSelection();
        break;
      case 'CycleSelection':
        changed = this.cycleSelection();
        break;
      default:
        return;
    }

    if (changed) {
      this.emitSelection();
    }
  }

  private selectAt(x: number, y: number, additive: boolean): boolean {
    const target = findNearestSelectablePlayer(this.world.players, x, y);

    if (!target) {
      return additive ? false : this.clearSelection();
    }

    let changed = false;
    if (!additive) {
      changed = this.clearSelectionExcept(target);
    }

    if (!target.selected) {
      target.selected = true;
      changed = true;
    }

    return changed;
  }

  private boxSelect(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    additive: boolean,
  ): boolean {
    let changed = false;

    if (!additive) {
      changed = this.clearSelection();
    }

    for (const player of this.world.players) {
      if (
        isSelectablePlayer(player) &&
        pointInRect(player.position.x, player.position.y, minX, minY, maxX, maxY) &&
        !player.selected
      ) {
        player.selected = true;
        changed = true;
      }
    }

    return changed;
  }

  private clearSelection(): boolean {
    let changed = false;

    for (const player of this.world.players) {
      if (player.selected) {
        player.selected = false;
        changed = true;
      }
    }

    return changed;
  }

  /** Selects the next friendly unit after the current selection, wrapping around. */
  private cycleSelection(): boolean {
    const selectable = this.world.players.filter(isSelectablePlayer);
    if (selectable.length === 0) return false;

    const currentIndex = selectable.findIndex((player) => player.selected);
    const next = selectable[currentIndex === -1 ? 0 : (currentIndex + 1) % selectable.length];

    let changed = this.clearSelectionExcept(next);
    if (!next.selected) {
      next.selected = true;
      changed = true;
    }
    return changed;
  }

  private clearSelectionExcept(keptPlayer: Player): boolean {
    let changed = false;

    for (const player of this.world.players) {
      if (player !== keptPlayer && player.selected) {
        player.selected = false;
        changed = true;
      }
    }

    return changed;
  }

  private emitSelection(): void {
    const ids = this.world.players
      .filter((player) => isSelectablePlayer(player) && player.selected)
      .map((player) => player.id)
      .sort((a, b) => a - b);

    this.events.emit('UnitsSelected', { ids });
  }
}
