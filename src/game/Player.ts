import { Vector2 } from '../utils/Vector2';
import type { EntityId } from '../ecs/Entity';
import { PLAYER } from './config';
import { type AnimationName, type Player, PlayerState, Team } from './types';

/** Creates a fresh player unit with default stats (design §9). */
export function createPlayer(id: EntityId, team: Team, x: number, y: number): Player {
  return {
    id,
    team,
    position: new Vector2(x, y),
    velocity: new Vector2(0, 0),
    rotation: team === Team.Player ? 0 : Math.PI,
    health: PLAYER.maxHealth,
    maxHealth: PLAYER.maxHealth,
    state: PlayerState.Idle,
    moveTarget: null,
    throwCooldown: 0,
    throwCharge: 0,
    aimDirection: new Vector2(1, 0),
    stunTimer: 0,
    throwTimer: 0,
    currentAnimation: 'idle',
    animationTime: 0,
    selected: false,
    alive: true,
    radius: PLAYER.radius,
    immunityTimer: 0,
    speedTimer: 0,
  };
}

/**
 * Resets an eliminated unit in place so it can respawn, preserving its id, team
 * and max health. Bypasses the FSM (which treats `Defeated` as terminal) because
 * respawning is a lifecycle reset, not a normal in-match transition.
 */
export function respawnPlayer(player: Player, x: number, y: number, immunity: number): void {
  player.position.set(x, y);
  player.velocity.set(0, 0);
  player.rotation = player.team === Team.Player ? 0 : Math.PI;
  player.health = player.maxHealth;
  player.state = PlayerState.Idle;
  player.currentAnimation = 'idle';
  player.animationTime = 0;
  player.moveTarget = null;
  player.throwCooldown = 0;
  player.throwCharge = 0;
  player.aimDirection.set(1, 0);
  player.stunTimer = 0;
  player.throwTimer = 0;
  player.alive = true;
  player.immunityTimer = immunity;
  player.speedTimer = 0;
}

/**
 * Explicit FSM transition table (design §10). A transition is only permitted
 * when the target state is listed for the current state. `Defeated` is
 * terminal.
 */
const TRANSITIONS: Record<PlayerState, readonly PlayerState[]> = {
  [PlayerState.Idle]: [
    PlayerState.Moving,
    PlayerState.PreparingThrow,
    PlayerState.Hit,
    PlayerState.Frozen,
    PlayerState.Defeated,
  ],
  [PlayerState.Moving]: [
    PlayerState.Idle,
    PlayerState.PreparingThrow,
    PlayerState.Hit,
    PlayerState.Frozen,
    PlayerState.Defeated,
  ],
  [PlayerState.PreparingThrow]: [
    PlayerState.Throwing,
    PlayerState.Idle,
    PlayerState.Hit,
    PlayerState.Frozen,
    PlayerState.Defeated,
  ],
  [PlayerState.Throwing]: [
    PlayerState.Recovering,
    PlayerState.Hit,
    PlayerState.Frozen,
    PlayerState.Defeated,
  ],
  [PlayerState.Recovering]: [
    PlayerState.Idle,
    PlayerState.Moving,
    PlayerState.Hit,
    PlayerState.Frozen,
    PlayerState.Defeated,
  ],
  [PlayerState.Hit]: [PlayerState.Idle, PlayerState.Frozen, PlayerState.Defeated],
  [PlayerState.Frozen]: [PlayerState.Idle, PlayerState.Defeated],
  [PlayerState.Defeated]: [],
};

const STATE_ANIMATION: Record<PlayerState, AnimationName> = {
  [PlayerState.Idle]: 'idle',
  [PlayerState.Moving]: 'walk',
  [PlayerState.PreparingThrow]: 'throw',
  [PlayerState.Throwing]: 'throw',
  [PlayerState.Recovering]: 'idle',
  [PlayerState.Hit]: 'hit',
  [PlayerState.Frozen]: 'hit',
  [PlayerState.Defeated]: 'defeated',
};

export function canTransition(from: PlayerState, to: PlayerState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/**
 * Attempts an explicit FSM transition. Returns true if it was allowed. Updates
 * the current animation to match the new state and resets the animation clock.
 */
export function transitionTo(player: Player, next: PlayerState): boolean {
  if (player.state === next) return true;
  if (!TRANSITIONS[player.state].includes(next)) return false;
  player.state = next;
  player.currentAnimation = STATE_ANIMATION[next];
  player.animationTime = 0;
  return true;
}

/** True when the unit is stunned/frozen/defeated and cannot act. */
export function isIncapacitated(player: Player): boolean {
  return (
    player.state === PlayerState.Hit ||
    player.state === PlayerState.Frozen ||
    player.state === PlayerState.Defeated
  );
}

/** True when the unit is free to accept new move/throw orders. */
export function canAcceptOrders(player: Player): boolean {
  return player.alive && !isIncapacitated(player);
}
