import type { EventBus } from '../core/EventBus';
import type { System } from '../ecs/System';
import { type AnimationName, PlayerState, type Team } from '../game/types';
import type { World } from '../game/World';

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

/**
 * Advances simulation-side animation clocks and selects presentation clips from
 * unit FSM state. Rendering consumes these fields without mutating the world.
 */
export class AnimationSystem implements System {
  readonly name = 'animation';

  private readonly unsubscribeRoundEnded: () => void;

  constructor(
    private readonly world: World,
    events: EventBus,
  ) {
    this.unsubscribeRoundEnded = events.on('RoundEnded', ({ winner }) => {
      this.handleRoundEnded(winner);
    });
  }

  update(dt: number): void {
    for (const player of this.world.players) {
      player.animationTime += dt;

      const expected = STATE_ANIMATION[player.state];
      if (player.currentAnimation !== expected && player.currentAnimation !== 'victory') {
        player.currentAnimation = expected;
        player.animationTime = 0;
      }
    }
  }

  dispose(): void {
    this.unsubscribeRoundEnded();
  }

  private handleRoundEnded(winner: Team): void {
    for (const player of this.world.players) {
      if (player.alive && player.team === winner) {
        player.currentAnimation = 'victory';
        player.animationTime = 0;
      }
    }
  }
}
