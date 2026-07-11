import { describe, expect, it } from 'vitest';
import { canTransition, createPlayer, transitionTo } from './Player';
import { PlayerState, Team } from './types';

describe('Player FSM', () => {
  it('creates a player with default idle state', () => {
    const p = createPlayer(1, Team.Player, 2, 3);
    expect(p.state).toBe(PlayerState.Idle);
    expect(p.alive).toBe(true);
    expect(p.position.x).toBe(2);
    expect(p.position.y).toBe(3);
  });

  it('allows explicit transitions and updates animation', () => {
    const p = createPlayer(1, Team.Player, 0, 0);
    expect(transitionTo(p, PlayerState.Moving)).toBe(true);
    expect(p.state).toBe(PlayerState.Moving);
    expect(p.currentAnimation).toBe('walk');
  });

  it('rejects illegal transitions', () => {
    const p = createPlayer(1, Team.Player, 0, 0);
    // Idle cannot jump straight to Recovering.
    expect(transitionTo(p, PlayerState.Recovering)).toBe(false);
    expect(p.state).toBe(PlayerState.Idle);
  });

  it('treats Defeated as terminal', () => {
    const p = createPlayer(1, Team.Player, 0, 0);
    transitionTo(p, PlayerState.Defeated);
    expect(canTransition(PlayerState.Defeated, PlayerState.Idle)).toBe(false);
    expect(transitionTo(p, PlayerState.Idle)).toBe(false);
    expect(p.state).toBe(PlayerState.Defeated);
  });
});
