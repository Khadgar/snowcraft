import type { Command } from '../core/commands';
import type { EventBus } from '../core/EventBus';
import type { System } from '../ecs/System';
import { AIM, THROW } from '../game/config';
import { canAcceptOrders, transitionTo } from '../game/Player';
import { launchSnowball } from '../game/Snowball';
import { computeThrowKinematics, throwSpawnDistance } from '../game/trajectory';
import { PlayerState, Team, type Player } from '../game/types';
import type { World } from '../game/World';
import { Vec2Pool } from '../utils/ObjectPool';
import { clamp, rotateTowards } from '../utils/math';

const EPSILON = 1e-9;

/**
 * Handles charge aiming, snowball launches, and throw windup/recovery timing.
 *
 * Aiming is decoupled from raw cursor snapping: `ChargeAim` only records the
 * target cursor, and each fixed step the charging unit rotates toward it at a
 * bounded turn speed (design §11), ignoring cursor motion inside a small
 * deadzone. The throw fires along the unit's smoothed facing so it matches the
 * on-screen aim reticle and trajectory preview.
 */
export class ThrowSystem implements System {
  readonly name = 'throw';

  private aimX = 0;
  private aimY = 0;

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
  ) {}

  handleCommand(command: Command): void {
    switch (command.type) {
      case 'ChargeStart':
        this.aimX = command.x;
        this.aimY = command.y;
        this.startCharge(this.aimX, this.aimY);
        break;
      case 'ChargeAim':
        this.aimX = command.x;
        this.aimY = command.y;
        break;
      case 'ChargeRelease':
        this.aimX = command.x;
        this.aimY = command.y;
        this.releaseCharge();
        break;
      case 'ChargeCancel':
        this.cancelCharge();
        break;
      default:
        break;
    }
  }

  update(dt: number): void {
    for (const player of this.world.players) {
      player.throwCooldown = Math.max(0, player.throwCooldown - dt);

      if (player.state === PlayerState.PreparingThrow) {
        if (player.team === Team.Player) this.steerAim(player, dt);
        player.throwCharge = clamp(player.throwCharge + dt / THROW.chargeTime, 0, 1);
      } else if (player.state === PlayerState.Throwing) {
        player.throwTimer += dt;
        if (player.throwTimer >= THROW.windup && transitionTo(player, PlayerState.Recovering)) {
          player.throwTimer = 0;
        }
      } else if (player.state === PlayerState.Recovering) {
        player.throwTimer += dt;
        if (player.throwTimer >= THROW.recovery && transitionTo(player, PlayerState.Idle)) {
          player.throwTimer = 0;
        }
      }
    }
  }

  /** Public API used by the AI system to make an enemy unit throw. Returns true if a snowball was launched. */
  tryThrow(player: Player, aimX: number, aimY: number, charge01: number): boolean {
    if (!canAcceptOrders(player) || player.throwCooldown > 0) return false;

    const charge = clamp(charge01, 0, 1);
    const dir = Vec2Pool.acquire();
    this.computeThrowDirection(player, aimX, aimY, dir);

    const { speed, arc } = computeThrowKinematics(charge);
    const spawnDistance = throwSpawnDistance();
    const spawnX = player.position.x + dir.x * spawnDistance;
    const spawnY = player.position.y + dir.y * spawnDistance;
    const snowball = this.world.acquireSnowball();
    const id = this.world.ids.allocate();

    launchSnowball(
      snowball,
      id,
      player.id,
      player.team,
      spawnX,
      spawnY,
      THROW.launchHeight,
      dir,
      speed,
      arc,
    );

    player.aimDirection.copy(dir);
    player.rotation = Math.atan2(dir.y, dir.x);
    player.throwCooldown = THROW.cooldown;
    player.throwCharge = 0;
    player.throwTimer = 0;

    if (!transitionTo(player, PlayerState.Throwing)) {
      transitionTo(player, PlayerState.PreparingThrow);
      transitionTo(player, PlayerState.Throwing);
    }

    Vec2Pool.release(dir);
    this.events.emit('SnowballThrown', { snowballId: id, ownerId: player.id, team: player.team });
    return true;
  }

  private startCharge(aimX: number, aimY: number): void {
    for (const player of this.world.players) {
      if (
        player.team !== Team.Player ||
        !player.selected ||
        !canAcceptOrders(player) ||
        player.throwCooldown > 0
      ) {
        continue;
      }

      if (transitionTo(player, PlayerState.PreparingThrow)) {
        player.throwCharge = 0;
        this.faceAim(player, aimX, aimY);
      }
    }
  }

  private releaseCharge(): void {
    for (const player of this.world.players) {
      if (this.isPlayerPreparingCommandTarget(player)) {
        // Throw along the unit's smoothed facing so the shot matches the aim
        // reticle/trajectory the player has been steering, not the raw cursor.
        const aimX = player.position.x + player.aimDirection.x * AIM.reticleRadius;
        const aimY = player.position.y + player.aimDirection.y * AIM.reticleRadius;
        this.tryThrow(player, aimX, aimY, player.throwCharge);
      }
    }
  }

  private cancelCharge(): void {
    for (const player of this.world.players) {
      if (this.isPlayerPreparingCommandTarget(player)) {
        player.throwCharge = 0;
        transitionTo(player, PlayerState.Idle);
      }
    }
  }

  private isPlayerPreparingCommandTarget(player: Player): boolean {
    return player.team === Team.Player && player.selected && player.state === PlayerState.PreparingThrow;
  }

  /**
   * Rotates a charging unit toward the current cursor over time at
   * {@link AIM.turnSpeed}, ignoring cursor movement within the deadzone so aim
   * stays steady when the cursor is close. Keeps `aimDirection` in sync with the
   * smoothed rotation.
   */
  private steerAim(player: Player, dt: number): void {
    const dx = this.aimX - player.position.x;
    const dy = this.aimY - player.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance >= AIM.deadzoneRadius) {
      const targetAngle = Math.atan2(dy, dx);
      player.rotation = rotateTowards(player.rotation, targetAngle, AIM.turnSpeed * dt);
    }

    player.aimDirection.set(Math.cos(player.rotation), Math.sin(player.rotation));
  }

  /** Immediately faces the cursor at charge start unless it is inside the deadzone. */
  private faceAim(player: Player, aimX: number, aimY: number): void {
    const dx = aimX - player.position.x;
    const dy = aimY - player.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance < AIM.deadzoneRadius) return;

    player.aimDirection.set(dx / distance, dy / distance);
    player.rotation = Math.atan2(player.aimDirection.y, player.aimDirection.x);
  }

  private computeThrowDirection(player: Player, aimX: number, aimY: number, out: Player['aimDirection']): void {
    const dx = aimX - player.position.x;
    const dy = aimY - player.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance > EPSILON) {
      out.set(dx / distance, dy / distance);
      return;
    }

    if (player.aimDirection.lengthSq() > EPSILON) {
      out.copy(player.aimDirection).normalize();
      return;
    }

    out.set(Math.cos(player.rotation), Math.sin(player.rotation));
  }
}
