import type { EventBus } from '../core/EventBus';
import type { System } from '../ecs/System';
import { OBSTACLE_HEIGHT, PLAYER } from '../game/config';
import type { Player, Snowball } from '../game/types';
import type { World } from '../game/World';
import { circleVsCircle, intersects } from '../physics/Collision';
import { SpatialHash } from '../physics/SpatialHash';
import { circle } from '../physics/shapes';

const CELL_SIZE = 2;

/**
 * Resolves projectile impacts against units and projectile-blocking obstacles.
 * Runs after projectile motion and only mutates snowball alive state; damage is
 * applied later by systems consuming PlayerHit events.
 */
export class CollisionSystem implements System {
  readonly name = 'collision';

  private readonly playerHash = new SpatialHash(CELL_SIZE);
  private readonly obstacleHash = new SpatialHash(CELL_SIZE);
  private readonly candidates = new Set<number>();
  private readonly snowballShape = circle(0, 0, 0);

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
  ) {}

  update(dt: number): void {
    void dt;
    this.rebuildBroadphase();

    for (const snowball of this.world.snowballs) {
      if (!snowball.alive) continue;

      this.resolvePlayerHit(snowball);
      if (!snowball.alive) continue;

      this.resolveObstacleHit(snowball);
    }
  }

  private rebuildBroadphase(): void {
    this.playerHash.clear();
    this.obstacleHash.clear();

    for (let i = 0; i < this.world.players.length; i++) {
      const player = this.world.players[i];
      if (!player.alive) continue;

      this.playerHash.insertBounds(
        i,
        player.position.x - player.radius,
        player.position.y - player.radius,
        player.position.x + player.radius,
        player.position.y + player.radius,
      );
    }

    const obstacles = this.world.arena.obstacles;
    for (let i = 0; i < obstacles.length; i++) {
      const obstacle = obstacles[i];
      if (!obstacle.blocksProjectiles) continue;

      this.obstacleHash.insertShape(i, obstacle.collision);
    }
  }

  private resolvePlayerHit(snowball: Snowball): void {
    if (snowball.height < 0 || snowball.height > PLAYER.standHeight) return;

    const r = snowball.radius;
    this.candidates.clear();
    this.playerHash.queryBounds(
      snowball.position.x - r,
      snowball.position.y - r,
      snowball.position.x + r,
      snowball.position.y + r,
      this.candidates,
    );

    let hitPlayer: Player | null = null;
    let hitDistanceSq = Number.POSITIVE_INFINITY;

    for (const index of this.candidates) {
      const player = this.world.players[index];
      if (
        !player.alive ||
        player.team === snowball.team ||
        player.id === snowball.ownerId ||
        !circleVsCircle(
          snowball.position.x,
          snowball.position.y,
          snowball.radius,
          player.position.x,
          player.position.y,
          player.radius,
        )
      ) {
        continue;
      }

      const dx = player.position.x - snowball.position.x;
      const dy = player.position.y - snowball.position.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < hitDistanceSq) {
        hitDistanceSq = distanceSq;
        hitPlayer = player;
      }
    }

    if (!hitPlayer) return;

    snowball.alive = false;
    this.events.emit('PlayerHit', {
      playerId: hitPlayer.id,
      attackerId: snowball.ownerId,
      damage: snowball.damage,
      x: snowball.position.x,
      y: snowball.position.y,
    });
    this.events.emit('SnowballImpact', {
      snowballId: snowball.id,
      x: snowball.position.x,
      y: snowball.position.y,
      hitPlayerId: hitPlayer.id,
    });
  }

  private resolveObstacleHit(snowball: Snowball): void {
    const r = snowball.radius;
    this.candidates.clear();
    this.obstacleHash.queryBounds(
      snowball.position.x - r,
      snowball.position.y - r,
      snowball.position.x + r,
      snowball.position.y + r,
      this.candidates,
    );

    this.snowballShape.x = snowball.position.x;
    this.snowballShape.y = snowball.position.y;
    this.snowballShape.radius = snowball.radius;

    for (const index of this.candidates) {
      const obstacle = this.world.arena.obstacles[index];
      if (
        obstacle.blocksProjectiles &&
        snowball.height <= OBSTACLE_HEIGHT[obstacle.type] &&
        intersects(this.snowballShape, obstacle.collision)
      ) {
        snowball.alive = false;
        this.events.emit('SnowballImpact', {
          snowballId: snowball.id,
          x: snowball.position.x,
          y: snowball.position.y,
          hitPlayerId: null,
        });
        return;
      }
    }
  }
}
