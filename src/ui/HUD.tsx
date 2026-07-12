import { render, type JSX } from 'preact';
import type { GameRenderer } from '../core/Game';
import { PLAYER, TEAM_COLORS } from '../game/config';
import { formatClock } from '../game/score';
import { PlayerState, Team, type Player } from '../game/types';
import type { World } from '../game/World';
import styles from './HUD.module.css';

type Stats = { fps: number; frameTimeMs: number };

/** Live DOM nodes the per-frame {@link HUD.sync} writes to (no re-render). */
interface HudRefs {
  lives: HTMLElement;
  enemies: HTMLElement;
  time: HTMLElement;
  fill: HTMLElement;
  health: HTMLElement;
  throwEl: HTMLElement;
  buffs: HTMLElement;
  debug: HTMLElement;
}

const teamColor = (team: Team): string => `#${TEAM_COLORS[team].toString(16).padStart(6, '0')}`;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Callback ref that stores the mounted element into `refs[key]` (returns void). */
function keep(refs: HudRefs, key: keyof HudRefs): (el: HTMLElement | null) => void {
  return (el) => {
    if (el) refs[key] = el;
  };
}

/**
 * Declarative view for the compact top-center fighter stats and the FPS pill.
 * Structure is rendered once; leaf nodes are handed back through `refs` so the
 * HUD can update them imperatively each frame without re-rendering (design §8).
 */
function HudView({ refs }: { refs: HudRefs }): JSX.Element {
  return (
    <>
      <div class={styles.stats}>
        <div class={styles.meta}>
          <span style={{ color: teamColor(Team.Player) }} ref={keep(refs, 'lives')} />
          <span class={styles.sep}>•</span>
          <span style={{ color: teamColor(Team.Enemy) }} ref={keep(refs, 'enemies')} />
          <span class={styles.sep}>•</span>
          <span class={styles.time} ref={keep(refs, 'time')} />
        </div>
        <div class={styles.fighter}>
          <div class={styles.meter}>
            <div class={styles.meterFill} ref={keep(refs, 'fill')} />
            <span class={styles.meterText} ref={keep(refs, 'health')} />
          </div>
          <span class={styles.throw} ref={keep(refs, 'throwEl')} />
        </div>
        <div class={styles.buffs} ref={keep(refs, 'buffs')} />
      </div>
      <div class={styles.debug} ref={keep(refs, 'debug')} />
    </>
  );
}

/**
 * DOM/CSS overlay that observes the SnowCraft world and presents a compact
 * top-center readout of the player's fighter — lives, enemies remaining, run
 * timer, health, throw readiness and active buffs — plus an FPS diagnostic.
 * Rendered once with Preact; per-frame updates are written straight to refs.
 */
export class HUD implements GameRenderer {
  private readonly host: HTMLDivElement;
  private readonly refs = {} as HudRefs;

  constructor(
    container: HTMLElement,
    private readonly world: World,
    private readonly getStats: () => Stats,
    private readonly isVisible: () => boolean,
    private readonly showFps: () => boolean,
  ) {
    this.host = document.createElement('div');
    this.host.style.pointerEvents = 'none';
    this.host.hidden = true;
    container.append(this.host);
    render(<HudView refs={this.refs} />, this.host);
  }

  sync(alpha: number): void {
    void alpha;
    const visible = this.isVisible();
    this.host.hidden = !visible;
    if (!visible) return;

    this.updateStats();

    const showFps = this.showFps();
    this.refs.debug.hidden = !showFps;
    if (showFps) this.refs.debug.textContent = this.formatDebug(this.getStats());
  }

  dispose(): void {
    render(null, this.host);
    this.host.remove();
  }

  private updateStats(): void {
    const { refs, world } = this;
    refs.lives.textContent = `♥ ${world.playerLives}`;
    refs.enemies.textContent = `Enemies ${world.countLiving(Team.Enemy)}`;
    refs.time.textContent = `⏱ ${formatClock(world.time)}`;

    const fighter = world.players.find((p) => p.team === Team.Player) ?? null;
    if (!fighter || !fighter.alive) {
      refs.fill.style.width = '0%';
      refs.health.textContent = 'Respawning…';
      refs.throwEl.textContent = '';
      refs.buffs.hidden = true;
      return;
    }

    const maxHealth = Math.max(1, fighter.maxHealth || PLAYER.maxHealth);
    const fraction = clamp01(fighter.health / maxHealth);
    refs.fill.style.width = `${Math.round(fraction * 100)}%`;
    refs.fill.style.backgroundColor = `hsl(${Math.round(fraction * 120)} 78% 48%)`;
    refs.health.textContent = `${Math.max(0, Math.ceil(fighter.health))}/${maxHealth}`;

    this.updateThrow(fighter);
    this.updateBuffs(fighter);
  }

  private updateThrow(fighter: Player): void {
    const el = this.refs.throwEl;
    const charging = fighter.throwCharge > 0 || fighter.state === PlayerState.PreparingThrow;
    if (charging) {
      el.textContent = `Power ${Math.round(clamp01(fighter.throwCharge) * 100)}%`;
      el.style.color = '#c68a12';
      return;
    }
    if (fighter.throwCooldown > 0) {
      el.textContent = `Cooldown ${fighter.throwCooldown.toFixed(1)}s`;
      el.style.color = '#3d7bb8';
      return;
    }
    el.textContent = 'Ready';
    el.style.color = '#2f8f52';
  }

  private updateBuffs(fighter: Player): void {
    const labels: string[] = [];
    if (fighter.immunityTimer > 0) labels.push(`🛡 ${Math.ceil(fighter.immunityTimer)}s`);
    if (fighter.speedTimer > 0) labels.push(`⚡ ${Math.ceil(fighter.speedTimer)}s`);
    this.refs.buffs.textContent = labels.join('   ');
    this.refs.buffs.hidden = labels.length === 0;
  }

  private formatDebug(stats: Stats): string {
    return `${Math.round(stats.fps)} FPS • ${stats.frameTimeMs.toFixed(1)} ms`;
  }
}
