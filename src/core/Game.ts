import { EventBus } from './EventBus';
import type { Command } from './commands';
import { GameLoop } from './GameLoop';
import { IdAllocator } from '../ecs/Entity';
import type { System } from '../ecs/System';
import { AssetManager } from '../engine/AssetManager';
import { Renderer } from '../engine/Renderer';
import { InputManager } from '../engine/InputManager';
import { MapLoader } from '../game/MapLoader';
import { World } from '../game/World';
import { SIM } from '../game/config';
import { Team, type Arena } from '../game/types';
import { findNearestSelectablePlayer } from '../systems/SelectionSystem';

/** Optional difficulty-driven overrides applied while spawning squads. */
export interface SpawnOptions {
  /** Maximum enemy units to spawn; extra enemy spawns are skipped. */
  maxEnemies?: number;
  /** Health assigned to each spawned enemy unit. */
  enemyMaxHealth?: number;
}

/** Per-frame view updater. Renderers observe the world and sync meshes. */
export interface GameRenderer {
  /** `alpha` is the interpolation factor in [0, 1) between fixed steps. */
  sync(alpha: number): void;
  dispose?(): void;
}

export type CommandHandler = (command: Command) => void;

/**
 * Top-level orchestrator (design §25, §30). Owns the world, engine services and
 * the fixed-timestep loop, and exposes registration hooks so gameplay systems,
 * renderers and command handlers can be composed in without tight coupling.
 */
export class Game {
  readonly events = new EventBus();
  readonly assets = new AssetManager();
  readonly renderer: Renderer;
  readonly input: InputManager;

  world!: World;
  private loop!: GameLoop;
  private running = true;
  private worldReady = false;

  private readonly systems: System[] = [];
  private readonly renderers: GameRenderer[] = [];
  private readonly commandHandlers: CommandHandler[] = [];

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);
    this.input = new InputManager(
      this.renderer.domElement,
      this.renderer.camera,
      () => this.worldReady && this.world.players.some((p) => p.selected),
      (x, y) => this.worldReady && findNearestSelectablePlayer(this.world.players, x, y) !== null,
      () => this.worldReady && this.running && !this.world.paused,
    );
  }

  /** Loads a map, builds the world, spawns squads and starts the loop. */
  async init(mapUrl: string, seed = 0x1234abcd, spawn: SpawnOptions = {}): Promise<void> {
    await this.assets.loadAll();

    const ids = new IdAllocator();
    const arena = await new MapLoader(ids).load(mapUrl);
    this.world = new World(arena, seed, ids);
    this.worldReady = true;
    this.spawnSquads(arena, spawn);

    this.renderer.frameArena(arena);
    this.events.emit('RoundStarted', { seed });

    this.loop = new GameLoop(SIM.dt, SIM.maxStepsPerFrame, this.fixedUpdate, this.render);
    this.loop.start();
  }

  /** Spawns both squads, applying difficulty overrides to the enemy team. */
  private spawnSquads(arena: Arena, spawn: SpawnOptions): void {
    let enemyCount = 0;

    for (const point of arena.spawns) {
      if (point.team === Team.Enemy) {
        if (spawn.maxEnemies !== undefined && enemyCount >= spawn.maxEnemies) continue;
        enemyCount++;
        const enemy = this.world.addPlayer(point.team, point.x, point.y);
        if (spawn.enemyMaxHealth !== undefined) {
          enemy.maxHealth = spawn.enemyMaxHealth;
          enemy.health = spawn.enemyMaxHealth;
        }
      } else {
        this.world.addPlayer(point.team, point.x, point.y);
      }
    }
  }

  registerSystem(system: System): void {
    this.systems.push(system);
  }

  addRenderer(renderer: GameRenderer): void {
    this.renderers.push(renderer);
  }

  onCommand(handler: CommandHandler): void {
    this.commandHandlers.push(handler);
  }

  /**
   * Whether the simulation is advancing. False while the main menu is shown
   * (the battlefield still renders). Distinct from `world.paused`, which is the
   * in-game pause used mid-match.
   */
  setRunning(running: boolean): void {
    this.running = running;
  }

  get loopStats(): { fps: number; frameTimeMs: number } {
    return { fps: this.loop.fps, frameTimeMs: this.loop.frameTimeMs };
  }

  /** One fixed simulation step; runs systems in the design §25 update order. */
  private readonly fixedUpdate = (dt: number): void => {
    for (const command of this.input.consume()) {
      this.dispatchCommand(command);
    }
    if (!this.running || this.world.paused) return;

    this.world.time += dt;
    for (const system of this.systems) {
      system.update(dt);
    }
    this.world.reclaimSnowballs();
  };

  private readonly render = (alpha: number): void => {
    for (const renderer of this.renderers) {
      renderer.sync(alpha);
    }
    this.renderer.render();
  };

  private dispatchCommand(command: Command): void {
    if (command.type === 'TogglePause' && this.running) {
      this.world.paused = !this.world.paused;
      this.events.emit('GamePaused', { paused: this.world.paused });
    }
    for (const handler of this.commandHandlers) {
      handler(command);
    }
  }

  dispose(): void {
    this.loop?.stop();
    this.input.dispose();
    for (const renderer of this.renderers) renderer.dispose?.();
    this.renderer.dispose();
    this.assets.dispose();
    this.events.clear();
  }
}
