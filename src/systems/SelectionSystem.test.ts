import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { createEmptyArena } from '../game/Arena';
import { Team } from '../game/types';
import { World } from '../game/World';
import {
  findNearestSelectablePlayer,
  pointInRect,
  SelectionSystem,
} from './SelectionSystem';

function createSelectionSystem(): { world: World; events: EventBus; selection: SelectionSystem } {
  const world = new World(createEmptyArena(), 1);
  const events = new EventBus();
  const selection = new SelectionSystem(world, events);

  return { world, events, selection };
}

describe('SelectionSystem', () => {
  it('single select picks nearest unit and deselects others', () => {
    const { world, selection } = createSelectionSystem();
    const first = world.addPlayer(Team.Player, 0, 0);
    const nearest = world.addPlayer(Team.Player, 0.1, 0);
    const other = world.addPlayer(Team.Player, 5, 5);
    first.selected = true;
    other.selected = true;

    selection.handleCommand({ type: 'SelectAt', x: 0.12, y: 0, additive: false });

    expect(first.selected).toBe(false);
    expect(nearest.selected).toBe(true);
    expect(other.selected).toBe(false);
  });

  it('additive select adds without clearing', () => {
    const { world, selection } = createSelectionSystem();
    const selected = world.addPlayer(Team.Player, 0, 0);
    const added = world.addPlayer(Team.Player, 2, 0);
    selected.selected = true;

    selection.handleCommand({ type: 'SelectAt', x: 2, y: 0, additive: true });

    expect(selected.selected).toBe(true);
    expect(added.selected).toBe(true);
  });

  it('clicking empty ground clears with non-additive selection', () => {
    const { world, selection } = createSelectionSystem();
    const selected = world.addPlayer(Team.Player, 0, 0);
    selected.selected = true;

    selection.handleCommand({ type: 'SelectAt', x: 10, y: 10, additive: false });

    expect(selected.selected).toBe(false);
  });

  it('box select selects units inside the rect and excludes those outside', () => {
    const { world, selection } = createSelectionSystem();
    const inside = world.addPlayer(Team.Player, 1, 1);
    const alsoInside = world.addPlayer(Team.Player, 2, 2);
    const outside = world.addPlayer(Team.Player, 4, 4);
    outside.selected = true;

    selection.handleCommand({
      type: 'BoxSelect',
      minX: 0,
      minY: 0,
      maxX: 3,
      maxY: 3,
      additive: false,
    });

    expect(inside.selected).toBe(true);
    expect(alsoInside.selected).toBe(true);
    expect(outside.selected).toBe(false);
  });

  it('enemy units are never selected', () => {
    const { world, selection } = createSelectionSystem();
    const enemy = world.addPlayer(Team.Enemy, 0, 0);
    const player = world.addPlayer(Team.Player, 2, 2);

    selection.handleCommand({ type: 'SelectAt', x: 0, y: 0, additive: false });
    selection.handleCommand({
      type: 'BoxSelect',
      minX: -1,
      minY: -1,
      maxX: 1,
      maxY: 1,
      additive: true,
    });

    expect(enemy.selected).toBe(false);
    expect(player.selected).toBe(false);
  });

  it('emits sorted selected unit ids when selection changes', () => {
    const { world, events, selection } = createSelectionSystem();
    const first = world.addPlayer(Team.Player, 0, 0);
    const second = world.addPlayer(Team.Player, 2, 0);
    const emitted: number[][] = [];
    events.on('UnitsSelected', ({ ids }) => {
      emitted.push([...ids]);
    });

    selection.handleCommand({
      type: 'BoxSelect',
      minX: 3,
      minY: -1,
      maxX: -1,
      maxY: 1,
      additive: false,
    });

    expect(emitted).toEqual([[first.id, second.id]]);
  });

  it('exposes pure helpers for point and nearest-unit selection', () => {
    const world = new World(createEmptyArena(), 1);
    const far = world.addPlayer(Team.Player, 2, 0);
    const near = world.addPlayer(Team.Player, 0, 0);

    expect(pointInRect(1, 1, 2, 2, 0, 0)).toBe(true);
    expect(findNearestSelectablePlayer([far, near], 0.1, 0)).toBe(near);
  });

  it('cycles the selection to the next friendly unit, wrapping around', () => {
    const { world, selection } = createSelectionSystem();
    const a = world.addPlayer(Team.Player, 0, 0);
    const b = world.addPlayer(Team.Player, 1, 0);
    const c = world.addPlayer(Team.Player, 2, 0);
    world.addPlayer(Team.Enemy, 5, 0); // never selectable

    selection.handleCommand({ type: 'CycleSelection' }); // none -> first
    expect(a.selected).toBe(true);

    selection.handleCommand({ type: 'CycleSelection' }); // a -> b
    expect(a.selected).toBe(false);
    expect(b.selected).toBe(true);

    selection.handleCommand({ type: 'CycleSelection' }); // b -> c
    expect(c.selected).toBe(true);

    selection.handleCommand({ type: 'CycleSelection' }); // c -> a (wrap)
    expect(a.selected).toBe(true);
    expect(c.selected).toBe(false);
  });
});
