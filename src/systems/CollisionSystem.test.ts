import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { EntityId } from '../ecs/Entity';
import { createEmptyArena } from '../game/Arena';
import { OBSTACLE_HEIGHT, PLAYER } from '../game/config';
import { createObstacle } from '../game/Obstacle';
import { launchSnowball } from '../game/Snowball';
import { Team, type Snowball } from '../game/types';
import { World } from '../game/World';
import { Vector2 } from '../utils/Vector2';
import { CollisionSystem } from './CollisionSystem';

const DT = 1 / 60;
const ZERO_DIRECTION = new Vector2(1, 0);

function addSnowball(
  world: World,
  ownerId: EntityId,
  team: Team,
  x: number,
  y: number,
  height: number,
): Snowball {
  const snowball = world.acquireSnowball();
  launchSnowball(snowball, world.ids.allocate(), ownerId, team, x, y, height, ZERO_DIRECTION, 0, 0);
  return snowball;
}

describe('CollisionSystem', () => {
  it('emits PlayerHit and consumes the snowball on enemy player overlap', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    const collision = new CollisionSystem(world, events);
    const attacker = world.addPlayer(Team.Player, 0, 0);
    const enemy = world.addPlayer(Team.Enemy, 5, 0);
    const snowball = addSnowball(world, attacker.id, Team.Player, 5, 0, PLAYER.standHeight);
    const hits: GameEvents['PlayerHit'][] = [];
    const impacts: GameEvents['SnowballImpact'][] = [];
    events.on('PlayerHit', (hit) => hits.push(hit));
    events.on('SnowballImpact', (impact) => impacts.push(impact));

    collision.update(DT);

    expect(snowball.alive).toBe(false);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      playerId: enemy.id,
      attackerId: attacker.id,
      damage: snowball.damage,
      x: 5,
      y: 0,
    });
    expect(impacts).toHaveLength(1);
    expect(impacts[0].hitPlayerId).toBe(enemy.id);
  });

  it('does not hit players when the snowball is above standing height', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    const collision = new CollisionSystem(world, events);
    const attacker = world.addPlayer(Team.Player, 0, 0);
    world.addPlayer(Team.Enemy, 5, 0);
    const snowball = addSnowball(world, attacker.id, Team.Player, 5, 0, PLAYER.standHeight + 0.01);
    const hits: GameEvents['PlayerHit'][] = [];
    events.on('PlayerHit', (hit) => hits.push(hit));

    collision.update(DT);

    expect(snowball.alive).toBe(true);
    expect(hits).toHaveLength(0);
  });

  it('does not apply friendly fire', () => {
    const world = new World(createEmptyArena(), 1);
    const events = new EventBus();
    const collision = new CollisionSystem(world, events);
    const attacker = world.addPlayer(Team.Player, 0, 0);
    world.addPlayer(Team.Player, 5, 0);
    const snowball = addSnowball(world, attacker.id, Team.Player, 5, 0, PLAYER.standHeight);
    const hits: GameEvents['PlayerHit'][] = [];
    events.on('PlayerHit', (hit) => hits.push(hit));

    collision.update(DT);

    expect(snowball.alive).toBe(true);
    expect(hits).toHaveLength(0);
  });

  it('blocks low snowballs on projectile-blocking obstacles', () => {
    const arena = createEmptyArena();
    arena.obstacles.push(createObstacle(100, { type: 'fort', x: 2, y: 0, width: 2, height: 1 }));
    const world = new World(arena, 1);
    const events = new EventBus();
    const collision = new CollisionSystem(world, events);
    const attacker = world.addPlayer(Team.Player, 0, 0);
    const snowball = addSnowball(world, attacker.id, Team.Player, 2, 0, OBSTACLE_HEIGHT.fort);
    const impacts: GameEvents['SnowballImpact'][] = [];
    events.on('SnowballImpact', (impact) => impacts.push(impact));

    collision.update(DT);

    expect(snowball.alive).toBe(false);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({
      snowballId: snowball.id,
      x: 2,
      y: 0,
      hitPlayerId: null,
    });
  });

  it('lets snowballs arc above obstacle block height', () => {
    const arena = createEmptyArena();
    arena.obstacles.push(createObstacle(100, { type: 'fort', x: 2, y: 0, width: 2, height: 1 }));
    const world = new World(arena, 1);
    const events = new EventBus();
    const collision = new CollisionSystem(world, events);
    const attacker = world.addPlayer(Team.Player, 0, 0);
    const snowball = addSnowball(world, attacker.id, Team.Player, 2, 0, OBSTACLE_HEIGHT.fort + 0.01);
    const impacts: GameEvents['SnowballImpact'][] = [];
    events.on('SnowballImpact', (impact) => impacts.push(impact));

    collision.update(DT);

    expect(snowball.alive).toBe(true);
    expect(impacts).toHaveLength(0);
  });
});
