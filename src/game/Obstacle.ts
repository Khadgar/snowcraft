import { Vector2 } from '../utils/Vector2';
import type { EntityId } from '../ecs/Entity';
import { circle, rect, type Shape } from '../physics/shapes';
import type { MapObjectData, Obstacle, ObstacleType } from './types';

interface ObstacleTemplate {
  collision: (x: number, y: number, data: MapObjectData) => Shape;
  cover: (x: number, y: number, data: MapObjectData) => Shape | null;
  blocksSight: boolean;
  blocksProjectiles: boolean;
  blocksMovement: boolean;
}

/** Default gameplay footprints per obstacle type (design §6, §14, §17). */
const TEMPLATES: Record<ObstacleType, ObstacleTemplate> = {
  tree: {
    collision: (x, y, d) => circle(x, y, d.radius ?? 0.35),
    cover: (x, y, d) => circle(x, y, (d.radius ?? 0.35) + 0.35),
    blocksSight: true,
    blocksProjectiles: true,
    blocksMovement: true,
  },
  rock: {
    collision: (x, y, d) => circle(x, y, d.radius ?? 0.6),
    cover: (x, y, d) => circle(x, y, (d.radius ?? 0.6) + 0.2),
    blocksSight: true,
    blocksProjectiles: true,
    blocksMovement: true,
  },
  fort: {
    collision: (x, y, d) => rect(x, y, (d.width ?? 2.4) / 2, (d.height ?? 1.2) / 2),
    cover: (x, y, d) => rect(x, y, (d.width ?? 2.4) / 2 + 0.2, (d.height ?? 1.2) / 2 + 0.2),
    blocksSight: true,
    blocksProjectiles: true,
    blocksMovement: true,
  },
  fence: {
    collision: (x, y, d) => rect(x, y, (d.width ?? 2) / 2, (d.height ?? 0.24) / 2),
    cover: () => null,
    blocksSight: false,
    blocksProjectiles: true,
    blocksMovement: true,
  },
  prop: {
    collision: (x, y, d) => circle(x, y, d.radius ?? 0.3),
    cover: () => null,
    blocksSight: false,
    blocksProjectiles: false,
    blocksMovement: false,
  },
};

/** Builds a simulation-ready obstacle from map data (design §6). */
export function createObstacle(id: EntityId, data: MapObjectData): Obstacle {
  const template = TEMPLATES[data.type];
  return {
    id,
    type: data.type,
    position: new Vector2(data.x, data.y),
    collision: template.collision(data.x, data.y, data),
    cover: template.cover(data.x, data.y, data),
    blocksSight: template.blocksSight,
    blocksProjectiles: template.blocksProjectiles,
    blocksMovement: template.blocksMovement,
  };
}
