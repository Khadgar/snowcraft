import './style.css';
import * as THREE from 'three';
import { Game } from './core/Game';
import { AudioManager } from './engine/AudioManager';
import { Settings, type AiDifficulty, type BuffTarget } from './engine/Settings';
import { SNOWBALL } from './game/config';
import { Team } from './game/types';
import { ArenaRenderer } from './render/ArenaRenderer';
import { PlayerRenderer } from './render/PlayerRenderer';
import { NavIndicatorRenderer } from './render/NavIndicatorRenderer';
import { AimIndicatorRenderer } from './render/AimIndicatorRenderer';
import { PickupRenderer } from './render/PickupRenderer';
import { ParticleRenderer } from './render/ParticleRenderer';
import { SelectionSystem } from './systems/SelectionSystem';
import { AISystem } from './systems/AISystem';
import { MovementSystem } from './systems/MovementSystem';
import { PickupSystem } from './systems/PickupSystem';
import { ThrowSystem } from './systems/ThrowSystem';
import { ProjectileSystem } from './systems/ProjectileSystem';
import { CollisionSystem } from './systems/CollisionSystem';
import { DamageSystem } from './systems/DamageSystem';
import { RoundSystem } from './systems/RoundSystem';
import { AnimationSystem } from './systems/AnimationSystem';
import { HUD } from './ui/HUD';
import { Menus } from './ui/Menus';
import { DebugOverlay } from './ui/DebugOverlay';

const container = document.getElementById('app');
if (!container) {
  throw new Error('Missing #app container');
}

const MAPS = [
  { label: 'Snowy Clearing', value: 'arena1.json' },
  { label: 'Frozen Pond', value: 'arena2.json' },
  { label: 'Village Skirmish', value: 'arena3.json' },
] as const;

const DIFFICULTIES = [
  { label: 'Easy', value: 'easy' },
  { label: 'Normal', value: 'normal' },
  { label: 'Hard', value: 'hard' },
] as const;

const OPPONENT_OPTIONS = [1, 2, 3].map((n) => ({ label: String(n), value: String(n) }));
const LIVES_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: String(n) }));
const BUFF_OPTIONS = [
  { label: 'Off', value: 'off' },
  { label: 'My squad', value: 'player' },
  { label: 'Both teams', value: 'both' },
] as const;

const settings = new Settings();
const knownMap = MAPS.some((m) => m.value === settings.get('selectedMap'));
const selectedMap = knownMap ? settings.get('selectedMap') : MAPS[0].value;
const mapUrl = `${import.meta.env.BASE_URL}maps/${selectedMap}`;

const game = new Game(container);
await game.init(mapUrl, undefined, {
  maxEnemies: settings.get('enemyCount'),
  enemyMaxHealth: settings.get('enemyLives') * SNOWBALL.damage,
});

// Hold at the main menu (battlefield renders but the simulation is idle)
// until the player starts the battle.
game.setRunning(false);

// Persist the win/loss tally as matches conclude (design §28).
game.events.on('RoundEnded', ({ winner }) => {
  settings.recordResult(winner === Team.Player);
});

// --- Audio (synthesized Web Audio; resumes on first user gesture) ---
const audio = new AudioManager(game.events);
audio.setMuted(settings.get('muted'));
const resumeAudioOnce = (): void => {
  audio.resume();
  window.removeEventListener('pointerdown', resumeAudioOnce);
};
window.addEventListener('pointerdown', resumeAudioOnce);

const setPaused = (paused: boolean): void => {
  if (game.world.paused === paused) return;
  game.world.paused = paused;
  game.events.emit('GamePaused', { paused });
};

// --- Menus (main / pause / victory / defeat) ---
new Menus(container, game.events, {
  start: () => {
    game.setRunning(true);
    audio.resume();
  },
  togglePause: () => setPaused(!game.world.paused),
  restart: () => window.location.reload(),
  maps: MAPS.map((m) => ({ label: m.label, value: m.value })),
  selectedMap,
  onSelectMap: (value) => {
    settings.set('selectedMap', value);
    window.location.reload();
  },
  muted: settings.get('muted'),
  onToggleMute: (muted) => {
    settings.set('muted', muted);
    audio.setMuted(muted);
  },
  difficulties: DIFFICULTIES.map((d) => ({ label: d.label, value: d.value })),
  selectedDifficulty: settings.get('difficulty'),
  onSelectDifficulty: (value) => {
    settings.set('difficulty', value as AiDifficulty);
    window.location.reload();
  },
  opponents: OPPONENT_OPTIONS,
  selectedOpponents: String(settings.get('enemyCount')),
  onSelectOpponents: (value) => {
    settings.set('enemyCount', Number(value));
    window.location.reload();
  },
  lives: LIVES_OPTIONS,
  selectedLives: String(settings.get('enemyLives')),
  onSelectLives: (value) => {
    settings.set('enemyLives', Number(value));
    window.location.reload();
  },
  buffOptions: BUFF_OPTIONS.map((b) => ({ label: b.label, value: b.value })),
  selectedBuffs: settings.get('buffs'),
  onSelectBuffs: (value) => {
    settings.set('buffs', value as BuffTarget);
    window.location.reload();
  },
  scores: { wins: settings.get('wins'), losses: settings.get('losses') },
});

// --- Simulation systems, registered in the design §25 update order:
//     AI -> Movement -> Throw -> Projectile -> Collision -> Damage -> Round -> Animation ---
const throwSystem = new ThrowSystem(game.world, game.events);
const ai = new AISystem(game.world, game.events, throwSystem, settings.get('difficulty'));
const movement = new MovementSystem(game.world);
const pickups = new PickupSystem(game.world, game.events, settings.get('buffs'));
const projectile = new ProjectileSystem(game.world, game.events);
const collision = new CollisionSystem(game.world, game.events);
const damage = new DamageSystem(game.world, game.events);
const round = new RoundSystem(game.world, game.events);
const animation = new AnimationSystem(game.world, game.events);
game.registerSystem(ai);
game.registerSystem(movement);
game.registerSystem(pickups);
game.registerSystem(throwSystem);
game.registerSystem(projectile);
game.registerSystem(collision);
game.registerSystem(damage);
game.registerSystem(round);
game.registerSystem(animation);

// --- Command handling (input → gameplay, design §23) ---
const selection = new SelectionSystem(game.world, game.events);
game.onCommand((command) => {
  selection.handleCommand(command);
  movement.handleCommand(command);
  throwSystem.handleCommand(command);
});

// --- Renderers (observe simulation, design §8) ---
const arenaRenderer = new ArenaRenderer(game.renderer.scene, game.assets, game.world.arena);
const playerRenderer = new PlayerRenderer(game.renderer.scene, game.assets, game.world);
const navIndicators = new NavIndicatorRenderer(game.renderer.scene, game.assets, game.world);
const aimIndicators = new AimIndicatorRenderer(game.renderer.scene, game.assets, game.world);
const pickupRenderer = new PickupRenderer(game.renderer.scene, game.assets, game.world);
const particles = new ParticleRenderer(game.renderer.scene, game.assets, game.world, game.events);
const hud = new HUD(container, game.world, () => game.loopStats);
const debug = new DebugOverlay(game.renderer.scene, game.world, container, () => game.loopStats);
game.addRenderer(playerRenderer);
game.addRenderer(navIndicators);
game.addRenderer(aimIndicators);
game.addRenderer(pickupRenderer);
game.addRenderer(particles);
game.addRenderer(hud);
game.addRenderer(debug);
game.addRenderer({ sync: () => {}, dispose: () => arenaRenderer.dispose() });

// Expose for debugging in the browser console.
(window as unknown as { game: Game; THREE: typeof THREE }).game = game;
(window as unknown as { game: Game; THREE: typeof THREE }).THREE = THREE;
