import { IdAllocator } from '../ecs/Entity';
import type { EntityId } from '../ecs/Entity';
import { Random } from '../utils/Random';
import type { ObjectPool } from '../utils/ObjectPool';
import { createSnowballPool } from './Snowball';
import { createPlayer } from './Player';
import { type Arena, type Pickup, type Player, type Snowball, Team } from './types';

/**
 * Mutable simulation state (design §7). Pure data + light lifecycle helpers;
 * all behavior lives in systems. Rendering observes this and never mutates it.
 */
export class World {
  readonly ids: IdAllocator;
  readonly players: Player[] = [];
  readonly snowballs: Snowball[] = [];
  readonly pickups: Pickup[] = [];
  readonly snowballPool: ObjectPool<Snowball> = createSnowballPool();
  readonly rng: Random;

  arena: Arena;
  time = 0;
  paused = false;
  /** Lives the player has left (respawns while > 0); 0 means finally defeated. */
  playerLives = 1;
  /** Lives the player started the match with. */
  playerLivesMax = 1;

  constructor(arena: Arena, seed = 0x1234abcd, ids: IdAllocator = new IdAllocator()) {
    this.arena = arena;
    this.rng = new Random(seed);
    this.ids = ids;
  }

  addPlayer(team: Team, x: number, y: number): Player {
    const player = createPlayer(this.ids.allocate(), team, x, y);
    this.players.push(player);
    return player;
  }

  getPlayer(id: EntityId): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  /** Acquires a pooled snowball and adds it to the active list. */
  acquireSnowball(): Snowball {
    const s = this.snowballPool.acquire();
    this.snowballs.push(s);
    return s;
  }

  /** Removes dead snowballs from the active list and returns them to the pool. */
  reclaimSnowballs(): void {
    for (let i = this.snowballs.length - 1; i >= 0; i--) {
      const s = this.snowballs[i];
      if (!s.alive) {
        this.snowballs.splice(i, 1);
        this.snowballPool.release(s);
      }
    }
  }

  livingPlayers(team: Team): Player[] {
    return this.players.filter((p) => p.alive && p.team === team);
  }

  countLiving(team: Team): number {
    let count = 0;
    for (const p of this.players) {
      if (p.alive && p.team === team) count++;
    }
    return count;
  }
}
