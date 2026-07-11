import type { EventBus } from '../core/EventBus';
import type { System } from '../ecs/System';
import { arenaContains } from '../game/Arena';
import { BUFF } from '../game/config';
import { type BuffType, Team, type Pickup, type Player } from '../game/types';
import type { World } from '../game/World';
import { intersects } from '../physics/Collision';
import { circle, type CircleShape } from '../physics/shapes';
import { Vector2 } from '../utils/Vector2';

/** Which team(s) may collect pickups. `off` disables the whole system. */
export type BuffTarget = 'off' | 'player' | 'both';

const BUFF_TYPES: readonly BuffType[] = ['life', 'immunity', 'speed'];
const SPAWN_MARGIN = 1.5;
const MIN_PLAYER_DISTANCE = 2;
const MIN_PICKUP_DISTANCE = 3.5;
const SPAWN_ATTEMPTS = 24;

/**
 * Spawns collectible buffs onto the arena and applies them when an eligible unit
 * walks over one (design: pickups). Also counts down each unit's active buff
 * timers. Runs after movement so unit positions are current.
 */
export class PickupSystem implements System {
  readonly name = 'pickup';

  private spawnTimer: number = BUFF.firstSpawnDelay;
  private readonly probe: CircleShape = circle(0, 0, BUFF.pickupRadius);

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
    private readonly target: BuffTarget = 'player',
  ) {}

  update(dt: number): void {
    this.decayBuffs(dt);
    if (this.target === 'off') return;

    this.updateSpawning(dt);
    this.resolvePickups();
  }

  private decayBuffs(dt: number): void {
    for (const player of this.world.players) {
      if (player.immunityTimer > 0) player.immunityTimer = Math.max(0, player.immunityTimer - dt);
      if (player.speedTimer > 0) player.speedTimer = Math.max(0, player.speedTimer - dt);
    }
  }

  private updateSpawning(dt: number): void {
    if (this.countActive() >= BUFF.maxActive) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    this.spawnTimer = BUFF.spawnInterval;
    this.spawnPickup();
  }

  private spawnPickup(): void {
    const spot = this.findOpenSpot();
    if (!spot) return;

    const pickup = this.acquirePickup();
    pickup.type = this.world.rng.pick(BUFF_TYPES);
    pickup.position.set(spot.x, spot.y);
    pickup.radius = BUFF.pickupRadius;
    pickup.active = true;
  }

  private resolvePickups(): void {
    for (const pickup of this.world.pickups) {
      if (!pickup.active) continue;

      const collector = this.findCollector(pickup);
      if (!collector) continue;

      this.applyBuff(collector, pickup.type);
      pickup.active = false;
      this.events.emit('BuffPickedUp', {
        playerId: collector.id,
        buff: pickup.type,
        x: pickup.position.x,
        y: pickup.position.y,
      });
    }
  }

  private findCollector(pickup: Pickup): Player | null {
    for (const player of this.world.players) {
      if (!player.alive || !this.isEligible(player)) continue;

      const dx = player.position.x - pickup.position.x;
      const dy = player.position.y - pickup.position.y;
      const reach = player.radius + pickup.radius;
      if (dx * dx + dy * dy <= reach * reach) return player;
    }
    return null;
  }

  private isEligible(player: Player): boolean {
    return this.target === 'both' || player.team === Team.Player;
  }

  private applyBuff(player: Player, type: BuffType): void {
    switch (type) {
      case 'life':
        player.maxHealth += BUFF.extraLife;
        player.health += BUFF.extraLife;
        break;
      case 'immunity':
        player.immunityTimer = Math.max(player.immunityTimer, BUFF.immunityDuration);
        break;
      case 'speed':
        player.speedTimer = Math.max(player.speedTimer, BUFF.speedDuration);
        break;
    }
  }

  private acquirePickup(): Pickup {
    const reused = this.world.pickups.find((p) => !p.active);
    if (reused) return reused;

    const pickup: Pickup = {
      id: this.world.ids.allocate(),
      type: 'life',
      position: new Vector2(),
      radius: BUFF.pickupRadius,
      active: false,
    };
    this.world.pickups.push(pickup);
    return pickup;
  }

  private countActive(): number {
    let count = 0;
    for (const pickup of this.world.pickups) {
      if (pickup.active) count++;
    }
    return count;
  }

  private findOpenSpot(): { x: number; y: number } | null {
    const arena = this.world.arena;
    const halfW = arena.width / 2 - SPAWN_MARGIN;
    const halfH = arena.height / 2 - SPAWN_MARGIN;

    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
      const x = this.world.rng.range(-halfW, halfW);
      const y = this.world.rng.range(-halfH, halfH);
      if (this.isSpotClear(x, y)) return { x, y };
    }
    return null;
  }

  private isSpotClear(x: number, y: number): boolean {
    if (!arenaContains(this.world.arena, x, y, SPAWN_MARGIN)) return false;

    this.probe.x = x;
    this.probe.y = y;
    for (const obstacle of this.world.arena.obstacles) {
      if (obstacle.blocksMovement && intersects(this.probe, obstacle.collision)) return false;
    }

    for (const player of this.world.players) {
      if (!player.alive) continue;
      if (distanceSq(x, y, player.position.x, player.position.y) < MIN_PLAYER_DISTANCE * MIN_PLAYER_DISTANCE) {
        return false;
      }
    }

    for (const pickup of this.world.pickups) {
      if (!pickup.active) continue;
      if (distanceSq(x, y, pickup.position.x, pickup.position.y) < MIN_PICKUP_DISTANCE * MIN_PICKUP_DISTANCE) {
        return false;
      }
    }

    return true;
  }
}

function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
