import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { System } from '../ecs/System';
import { arenaContains } from '../game/Arena';
import { PLAYER, RESPAWN } from '../game/config';
import { respawnPlayer } from '../game/Player';
import { Team } from '../game/types';
import type { World } from '../game/World';
import { intersects } from '../physics/Collision';
import { circle, type CircleShape } from '../physics/shapes';

const SPAWN_MARGIN = 1.5;
const SPAWN_ATTEMPTS = 32;
const MIN_ENEMY_DISTANCE = 4;

/**
 * Single-hero respawn lifecycle. When the player unit is eliminated it consumes
 * one life and, if any remain, reappears after a short delay at a random open
 * spot with a few seconds of immunity. When lives run out the unit stays
 * defeated so the {@link RoundSystem} can end the match.
 */
export class RespawnSystem implements System {
  readonly name = 'respawn';

  private respawnTimer = 0;
  private pendingId: number | null = null;
  private readonly probe: CircleShape = circle(0, 0, PLAYER.radius);
  private readonly unsubscribe: () => void;

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
  ) {
    this.unsubscribe = this.events.on('PlayerDefeated', (event) => this.handleDefeated(event));
  }

  update(dt: number): void {
    if (this.pendingId === null) return;

    this.respawnTimer -= dt;
    if (this.respawnTimer > 0) return;

    const player = this.world.getPlayer(this.pendingId);
    this.pendingId = null;
    if (!player) return;

    const spot = this.findRespawnSpot();
    respawnPlayer(player, spot.x, spot.y, RESPAWN.immunity);
    player.selected = true;
    this.events.emit('PlayerRespawned', { playerId: player.id, x: spot.x, y: spot.y });
  }

  dispose(): void {
    this.unsubscribe();
  }

  private handleDefeated(event: GameEvents['PlayerDefeated']): void {
    if (event.team !== Team.Player) return;

    this.world.playerLives = Math.max(0, this.world.playerLives - 1);
    if (this.world.playerLives <= 0) return;

    this.pendingId = event.playerId;
    this.respawnTimer = RESPAWN.delay;
  }

  private findRespawnSpot(): { x: number; y: number } {
    const arena = this.world.arena;
    const halfW = arena.width / 2 - SPAWN_MARGIN;
    const halfH = arena.height / 2 - SPAWN_MARGIN;

    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
      const x = this.world.rng.range(-halfW, halfW);
      const y = this.world.rng.range(-halfH, halfH);
      if (this.isSpotClear(x, y)) return { x, y };
    }
    return this.fallbackSpot();
  }

  private isSpotClear(x: number, y: number): boolean {
    if (!arenaContains(this.world.arena, x, y, SPAWN_MARGIN)) return false;

    this.probe.x = x;
    this.probe.y = y;
    for (const obstacle of this.world.arena.obstacles) {
      if (obstacle.blocksMovement && intersects(this.probe, obstacle.collision)) return false;
    }

    for (const other of this.world.players) {
      if (!other.alive || other.team !== Team.Enemy) continue;
      const dx = x - other.position.x;
      const dy = y - other.position.y;
      if (dx * dx + dy * dy < MIN_ENEMY_DISTANCE * MIN_ENEMY_DISTANCE) return false;
    }

    return true;
  }

  /** Falls back to a player spawn point (or the arena center) when no open spot is found. */
  private fallbackSpot(): { x: number; y: number } {
    const spawn = this.world.arena.spawns.find((s) => s.team === Team.Player);
    return spawn ? { x: spawn.x, y: spawn.y } : { x: 0, y: 0 };
  }
}
