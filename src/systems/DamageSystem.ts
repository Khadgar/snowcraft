import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { System } from '../ecs/System';
import { DAMAGE, ENEMY } from '../game/config';
import { transitionTo } from '../game/Player';
import { PlayerState, Team } from '../game/types';
import type { Player } from '../game/types';
import type { World } from '../game/World';

const EPSILON = 1e-9;
const KNOCKBACK_DAMPING = 12;
const STOP_SPEED = 0.02;

/**
 * Applies snowball hit damage, stun recovery, and short knockback slides.
 */
export class DamageSystem implements System {
  readonly name = 'damage';

  private readonly unsubscribe: () => void;

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
  ) {
    this.unsubscribe = this.events.on('PlayerHit', (hit) => this.handlePlayerHit(hit));
  }

  update(dt: number): void {
    for (const player of this.world.players) {
      if (!this.isStunned(player) || player.stunTimer <= 0) continue;

      player.position.addScaled(player.velocity, dt);
      player.velocity.scale(Math.exp(-KNOCKBACK_DAMPING * dt));

      if (player.velocity.lengthSq() <= STOP_SPEED * STOP_SPEED) {
        player.velocity.set(0, 0);
      }

      player.stunTimer = Math.max(0, player.stunTimer - dt);
      if (player.stunTimer <= 0 && player.alive) {
        player.velocity.set(0, 0);
        transitionTo(player, PlayerState.Idle);
      }
    }
  }

  dispose(): void {
    this.unsubscribe();
  }

  private handlePlayerHit(hit: GameEvents['PlayerHit']): void {
    const player = this.world.getPlayer(hit.playerId);
    if (!player || !player.alive || player.state === PlayerState.Defeated) return;

    // Immunity buff: shrug off the hit entirely (no damage, stun or knockback).
    if (player.immunityTimer > 0) return;

    player.health = Math.max(0, player.health - hit.damage);

    if (player.health <= 0) {
      player.alive = false;
      player.velocity.set(0, 0);
      transitionTo(player, PlayerState.Defeated);
      this.events.emit('PlayerDefeated', { playerId: player.id, team: player.team });
      return;
    }

    // Your units cannot be knocked out of a throw: while charging or throwing a
    // non-lethal hit only deals damage, so the shot still lands.
    if (player.team === Team.Player && this.isThrowing(player)) {
      return;
    }

    const isEnemy = player.team === Team.Enemy;
    this.applyKnockback(player, hit.x, hit.y, isEnemy ? ENEMY.knockbackScale : 1);
    player.stunTimer = DAMAGE.stun * (isEnemy ? ENEMY.hitStunScale : 1);
    transitionTo(player, PlayerState.Hit);
  }

  private isThrowing(player: Player): boolean {
    return player.state === PlayerState.PreparingThrow || player.state === PlayerState.Throwing;
  }

  private applyKnockback(player: Player, impactX: number, impactY: number, scale = 1): void {
    let dx = player.position.x - impactX;
    let dy = player.position.y - impactY;
    const distance = Math.hypot(dx, dy);

    if (distance > EPSILON) {
      dx /= distance;
      dy /= distance;
    } else {
      dx = 1;
      dy = 0;
    }

    player.velocity.x += dx * DAMAGE.knockback * scale;
    player.velocity.y += dy * DAMAGE.knockback * scale;
  }

  private isStunned(player: Player): boolean {
    return player.state === PlayerState.Hit || player.state === PlayerState.Frozen;
  }
}
