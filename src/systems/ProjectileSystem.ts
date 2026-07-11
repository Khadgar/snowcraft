import type { System } from '../ecs/System';
import type { EventBus } from '../core/EventBus';
import type { World } from '../game/World';
import { SNOWBALL } from '../game/config';
import { arenaContains } from '../game/Arena';

/**
 * Integrates snowball ballistic motion each fixed step (design §12, §25).
 * Responsible ONLY for motion and lifetime: ground x/y advance by velocity,
 * height arcs under gravity. Player/obstacle hit detection is handled by the
 * CollisionSystem, which runs immediately after (design §25 update order).
 * Dead snowballs are reclaimed to the pool by the game loop.
 */
export class ProjectileSystem implements System {
  readonly name = 'projectile';

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
  ) {}

  update(dt: number): void {
    const arena = this.world.arena;
    for (const s of this.world.snowballs) {
      if (!s.alive) continue;

      s.age += dt;
      s.position.addScaled(s.velocity, dt);
      s.heightVelocity -= SNOWBALL.gravity * dt;
      s.height += s.heightVelocity * dt;

      if (s.height <= 0) {
        // Landed on the ground: a miss. Emit an impact for the snow-puff FX.
        s.height = 0;
        s.alive = false;
        this.events.emit('SnowballImpact', {
          snowballId: s.id,
          x: s.position.x,
          y: s.position.y,
          hitPlayerId: null,
        });
        continue;
      }

      if (s.age > SNOWBALL.maxLifetime || !arenaContains(arena, s.position.x, s.position.y, -2)) {
        s.alive = false;
      }
    }
  }
}
