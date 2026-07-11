import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { createEmptyArena } from '../game/Arena';
import { Team } from '../game/types';
import { World } from '../game/World';
import { AnimationSystem } from './AnimationSystem';

describe('AnimationSystem', () => {
  it('advances player animation clocks', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    const animation = new AnimationSystem(world, events);
    const player = world.addPlayer(Team.Player, 0, 0);

    animation.update(0.25);

    expect(player.animationTime).toBeCloseTo(0.25);
  });

  it('plays victory for alive winning units when the round ends', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    const animation = new AnimationSystem(world, events);
    const winner = world.addPlayer(Team.Player, -1, 0);
    const defeatedWinner = world.addPlayer(Team.Player, -2, 0);
    const loser = world.addPlayer(Team.Enemy, 1, 0);
    defeatedWinner.alive = false;

    events.emit('RoundEnded', { winner: Team.Player });

    expect(winner.currentAnimation).toBe('victory');
    expect(winner.animationTime).toBe(0);
    expect(defeatedWinner.currentAnimation).toBe('idle');
    expect(loser.currentAnimation).toBe('idle');

    animation.dispose();
  });
});
