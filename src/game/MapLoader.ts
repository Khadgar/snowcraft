import { IdAllocator } from '../ecs/Entity';
import { Team, type Arena, type MapData, type SpawnPoint } from './types';
import { createObstacle } from './Obstacle';

/**
 * Loads arena definitions from JSON (design §6, §22) and assembles a
 * simulation-ready {@link Arena}. Obstacle ids are allocated from the provided
 * allocator so they share the world's id space.
 */
export class MapLoader {
  constructor(private readonly ids: IdAllocator) {}

  /** Fetches and parses a map JSON file, then builds the arena. */
  async load(url: string): Promise<Arena> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load map "${url}": ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as MapData;
    return this.build(data);
  }

  /** Builds an arena directly from parsed map data. */
  build(data: MapData): Arena {
    const obstacles = data.objects.map((obj) => createObstacle(this.ids.allocate(), obj));
    const spawns: SpawnPoint[] = (data.spawns ?? []).map((s) => ({ team: s.team, x: s.x, y: s.y }));
    if (spawns.length === 0) {
      spawns.push(...defaultSpawns(data.width, data.height));
    }
    return { width: data.width, height: data.height, obstacles, spawns };
  }
}

/** Generates symmetric 3v3 spawn points when a map omits them. */
function defaultSpawns(width: number, height: number): SpawnPoint[] {
  const x = width / 2 - 3;
  const ys = [-height / 4, 0, height / 4];
  const spawns: SpawnPoint[] = [];
  for (const y of ys) {
    spawns.push({ team: Team.Player, x: -x, y });
    spawns.push({ team: Team.Enemy, x, y });
  }
  return spawns;
}
