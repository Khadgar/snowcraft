import type { System } from '../ecs/System';
import type { EventBus } from '../core/EventBus';
import type { World } from '../game/World';
import { Team } from '../game/types';

/**
 * Watches for the win/loss condition (design §2) and emits a single
 * `RoundEnded` event. The player wins when the enemy squad is wiped out. Because
 * the player hero respawns while it has lives, the player only *loses* once the
 * hero is down AND out of lives. Rendering/UI observe `RoundEnded` (or
 * {@link result}) to show the victory/defeat screen.
 */
export class RoundSystem implements System {
  readonly name = 'round';
  private ended = false;
  private winner: Team | null = null;

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
  ) {}

  /** The winning team once the round is over, otherwise null. */
  get result(): Team | null {
    return this.winner;
  }

  get isOver(): boolean {
    return this.ended;
  }

  update(): void {
    if (this.ended) return;
    const players = this.world.countLiving(Team.Player);
    const enemies = this.world.countLiving(Team.Enemy);

    // The player wins the moment the enemy squad is eliminated.
    if (enemies === 0) {
      this.end(Team.Player);
      return;
    }

    // The player only loses when the hero is down and has no lives left to
    // respawn; while lives remain a downed hero is awaiting respawn.
    if (players === 0 && this.world.playerLives <= 0) {
      this.end(Team.Enemy);
    }
  }

  private end(winner: Team): void {
    this.ended = true;
    this.winner = winner;
    this.events.emit('RoundEnded', { winner });
  }
}
