import type { System } from '../ecs/System';
import type { EventBus } from '../core/EventBus';
import type { World } from '../game/World';
import { Team } from '../game/types';

/**
 * Watches for the elimination win/loss condition (design §2) and emits a single
 * `RoundEnded` event when one squad is wiped out. The winner is the team with
 * survivors. Rendering/UI observe `RoundEnded` (or {@link result}) to show the
 * victory/defeat screen.
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
    if (players > 0 && enemies > 0) return;

    // A squad has been eliminated. Decide the winner (both empty is a draw that
    // favors the player's survival check — player loss takes precedence only if
    // the player squad is the one wiped out).
    this.ended = true;
    this.winner = players > 0 ? Team.Player : Team.Enemy;
    this.events.emit('RoundEnded', { winner: this.winner });
  }
}
