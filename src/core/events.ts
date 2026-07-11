import type { EntityId } from '../ecs/Entity';
import type { BuffType, Team } from '../game/types';

/**
 * Strongly-typed event payloads for the {@link EventBus} (design §24). Systems
 * communicate through these instead of holding direct references.
 */
export interface GameEvents {
  SnowballThrown: { snowballId: EntityId; ownerId: EntityId; team: Team };
  SnowballImpact: { snowballId: EntityId; x: number; y: number; hitPlayerId: EntityId | null };
  PlayerHit: {
    playerId: EntityId;
    attackerId: EntityId;
    damage: number;
    x: number;
    y: number;
  };
  PlayerDefeated: { playerId: EntityId; team: Team };
  BuffPickedUp: { playerId: EntityId; buff: BuffType; x: number; y: number };
  UnitsSelected: { ids: readonly EntityId[] };
  RoundStarted: { seed: number };
  RoundEnded: { winner: Team };
  GamePaused: { paused: boolean };
}

export type GameEventType = keyof GameEvents;
