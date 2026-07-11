import type { GameRenderer } from '../core/Game';
import { PLAYER, TEAM_COLORS, THROW } from '../game/config';
import type { World } from '../game/World';
import { PlayerState, Team, type Player } from '../game/types';

type HudRow = {
  root: HTMLDivElement;
  label: HTMLDivElement;
  healthFill: HTMLDivElement;
  healthText: HTMLSpanElement;
  throwFill: HTMLDivElement;
  throwText: HTMLSpanElement;
  buffs: HTMLDivElement;
};

/**
 * DOM/CSS overlay that observes the SnowCraft world and presents squad status,
 * selected-unit health, throw power/cooldowns, pause state, and FPS diagnostics.
 */
export class HUD implements GameRenderer {
  private readonly root: HTMLDivElement;
  private readonly world: World;
  private readonly getStats: () => { fps: number; frameTimeMs: number };
  private readonly teamStatus: HTMLDivElement;
  private readonly playerTeamText: HTMLSpanElement;
  private readonly enemyTeamText: HTMLSpanElement;
  private readonly selectedList: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly debugLine: HTMLDivElement;
  private readonly pausedBanner: HTMLDivElement;
  private readonly rows = new Map<number, HudRow>();

  constructor(container: HTMLElement, world: World, getStats: () => { fps: number; frameTimeMs: number }) {
    this.world = world;
    this.getStats = getStats;
    this.root = this.createDiv('snowcraft-hud');
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.pointerEvents = 'none';

    const style = document.createElement('style');
    style.textContent = this.styles();
    this.root.append(style);

    const topBar = this.createDiv('snowcraft-hud__top');
    this.teamStatus = this.createDiv('snowcraft-hud__team-status');
    this.playerTeamText = document.createElement('span');
    this.enemyTeamText = document.createElement('span');
    const teamSeparator = document.createElement('span');
    teamSeparator.textContent = '  •  ';
    teamSeparator.className = 'snowcraft-hud__team-separator';
    this.teamStatus.append(this.playerTeamText, teamSeparator, this.enemyTeamText);
    this.debugLine = this.createDiv('snowcraft-hud__debug');
    topBar.append(this.teamStatus, this.debugLine);

    const selectedPanel = this.createDiv('snowcraft-hud__selected-panel');
    const selectedTitle = this.createDiv('snowcraft-hud__panel-title');
    selectedTitle.textContent = 'Selected Squad';
    this.hint = this.createDiv('snowcraft-hud__hint');
    this.hint.textContent = 'Click a unit to select • Tab to switch • WASD or right-click to move • Hold left mouse to aim & throw.';
    this.selectedList = this.createDiv('snowcraft-hud__selected-list');
    selectedPanel.append(selectedTitle, this.hint, this.selectedList);

    this.pausedBanner = this.createDiv('snowcraft-hud__paused');
    this.pausedBanner.textContent = 'PAUSED';

    this.root.append(topBar, selectedPanel, this.pausedBanner);
    container.append(this.root);
  }

  sync(alpha: number): void {
    void alpha;
    this.updateTeamStatus();
    this.updateSelectedRows();
    this.updateDebugLine();
    this.pausedBanner.hidden = !this.world.paused;
  }

  dispose(): void {
    this.root.remove();
    this.rows.clear();
  }

  private updateTeamStatus(): void {
    const playerCount = this.world.countLiving(Team.Player);
    const enemyCount = this.world.countLiving(Team.Enemy);
    this.playerTeamText.textContent = `You ${playerCount}`;
    this.playerTeamText.style.color = this.teamColor(Team.Player);
    this.enemyTeamText.textContent = `Enemy ${enemyCount}`;
    this.enemyTeamText.style.color = this.teamColor(Team.Enemy);
  }

  private updateSelectedRows(): void {
    let selectedCount = 0;

    for (const player of this.world.players) {
      const row = this.getRow(player);
      const selected = player.selected;
      row.root.hidden = !selected;

      if (selected) {
        selectedCount++;
        this.updateRow(row, player);
      }
    }

    this.hint.hidden = selectedCount > 0;
  }

  private updateRow(row: HudRow, player: Player): void {
    const teamName = player.team === Team.Player ? 'You' : 'Enemy';
    row.label.textContent = `${teamName} #${player.id}`;
    row.label.style.color = this.teamColor(player.team);

    const maxHealth = Math.max(1, player.maxHealth || PLAYER.maxHealth);
    const healthFraction = this.clamp01(player.health / maxHealth);
    row.healthFill.style.width = `${Math.round(healthFraction * 100)}%`;
    row.healthFill.style.backgroundColor = `hsl(${Math.round(healthFraction * 120)} 78% 48%)`;
    row.healthText.textContent = `${Math.max(0, Math.ceil(player.health))}/${maxHealth}`;

    this.updateBuffs(row, player);

    const charging = player.throwCharge > 0 || player.state === PlayerState.PreparingThrow;
    if (charging) {
      const charge = this.clamp01(player.throwCharge);
      row.throwFill.style.width = `${Math.round(charge * 100)}%`;
      row.throwFill.style.backgroundColor = '#ffd75a';
      row.throwText.textContent = `Power ${Math.round(charge * 100)}%`;
      return;
    }

    if (player.throwCooldown > 0) {
      const cooldown = this.clamp01(player.throwCooldown / THROW.cooldown);
      row.throwFill.style.width = `${Math.round(cooldown * 100)}%`;
      row.throwFill.style.backgroundColor = '#70b7ff';
      row.throwText.textContent = `Cooldown ${player.throwCooldown.toFixed(1)}s`;
      return;
    }

    row.throwFill.style.width = '100%';
    row.throwFill.style.backgroundColor = '#9ce37d';
    row.throwText.textContent = 'Ready';
  }

  private updateBuffs(row: HudRow, player: Player): void {
    const labels: string[] = [];
    if (player.immunityTimer > 0) labels.push(`🛡 Immune ${player.immunityTimer.toFixed(1)}s`);
    if (player.speedTimer > 0) labels.push(`⚡ Speed ${player.speedTimer.toFixed(1)}s`);
    row.buffs.textContent = labels.join('   ');
    row.buffs.hidden = labels.length === 0;
  }

  private updateDebugLine(): void {
    const stats = this.getStats();
    this.debugLine.textContent = `${Math.round(stats.fps)} FPS • ${stats.frameTimeMs.toFixed(1)} ms`;
  }

  private getRow(player: Player): HudRow {
    const existing = this.rows.get(player.id);
    if (existing) return existing;

    const root = this.createDiv('snowcraft-hud__unit-row');
    const label = this.createDiv('snowcraft-hud__unit-label');
    const health = this.createMeter('Health');
    const throwMeter = this.createMeter('Throw');
    const buffs = this.createDiv('snowcraft-hud__buffs');

    root.append(label, health.root, throwMeter.root, buffs);
    this.selectedList.append(root);

    const row: HudRow = {
      root,
      label,
      healthFill: health.fill,
      healthText: health.text,
      throwFill: throwMeter.fill,
      throwText: throwMeter.text,
      buffs,
    };
    this.rows.set(player.id, row);
    return row;
  }

  private createMeter(label: string): { root: HTMLDivElement; fill: HTMLDivElement; text: HTMLSpanElement } {
    const root = this.createDiv('snowcraft-hud__meter');
    const fill = this.createDiv('snowcraft-hud__meter-fill');
    const text = document.createElement('span');
    text.className = 'snowcraft-hud__meter-text';
    text.textContent = label;
    root.append(fill, text);
    return { root, fill, text };
  }

  private createDiv(className: string): HTMLDivElement {
    const div = document.createElement('div');
    div.className = className;
    return div;
  }

  private teamColor(team: Team): string {
    return `#${TEAM_COLORS[team].toString(16).padStart(6, '0')}`;
  }

  private clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  private styles(): string {
    return `
.snowcraft-hud {
  color: #263343;
  font-family: 'Segoe UI', system-ui, sans-serif;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.45);
}

.snowcraft-hud__top {
  align-items: flex-start;
  display: flex;
  justify-content: space-between;
  left: 18px;
  position: absolute;
  right: 18px;
  top: 16px;
}

.snowcraft-hud__team-status,
.snowcraft-hud__debug,
.snowcraft-hud__selected-panel,
.snowcraft-hud__paused {
  backdrop-filter: blur(8px);
  background: rgba(255, 255, 255, 0.82);
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 18px;
  box-shadow: 0 8px 20px rgba(28, 50, 74, 0.18);
}

.snowcraft-hud__team-status {
  font-size: 20px;
  font-weight: 800;
  padding: 10px 16px;
}

.snowcraft-hud__team-separator {
  color: #8ba0b5;
}

.snowcraft-hud__debug {
  color: #4f6278;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 12px;
}

.snowcraft-hud__selected-panel {
  bottom: 18px;
  left: 18px;
  max-width: min(430px, calc(100% - 36px));
  min-width: 310px;
  padding: 14px;
  position: absolute;
}

.snowcraft-hud__panel-title {
  color: #35485d;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.snowcraft-hud__hint {
  color: #5c7086;
  font-size: 14px;
  line-height: 1.35;
}

.snowcraft-hud__selected-list {
  display: grid;
  gap: 8px;
}

.snowcraft-hud__unit-row {
  background: rgba(245, 250, 255, 0.88);
  border: 1px solid rgba(122, 152, 183, 0.3);
  border-radius: 14px;
  display: grid;
  gap: 6px;
  padding: 9px;
}

.snowcraft-hud__unit-label {
  font-size: 14px;
  font-weight: 900;
}

.snowcraft-hud__meter {
  background: rgba(37, 56, 76, 0.16);
  border-radius: 999px;
  height: 18px;
  overflow: hidden;
  position: relative;
}

.snowcraft-hud__meter-fill {
  border-radius: inherit;
  height: 100%;
  transition: width 80ms linear, background-color 120ms linear;
  width: 0;
}

.snowcraft-hud__meter-text {
  color: #1d2b39;
  font-size: 12px;
  font-weight: 900;
  inset: 0;
  line-height: 18px;
  position: absolute;
  text-align: center;
}

.snowcraft-hud__paused {
  color: #2e3e50;
  font-size: clamp(36px, 8vw, 84px);
  font-weight: 1000;
  left: 50%;
  letter-spacing: 0.12em;
  padding: 18px 34px;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%) rotate(-2deg);
}

.snowcraft-hud__buffs {
  color: #1f6f4c;
  font-size: 12px;
  font-weight: 900;
}

.snowcraft-hud__paused[hidden],
.snowcraft-hud__hint[hidden],
.snowcraft-hud__unit-row[hidden],
.snowcraft-hud__buffs[hidden] {
  display: none;
}

@media (max-width: 520px) {
  .snowcraft-hud__top {
    left: 10px;
    right: 10px;
    top: 10px;
  }

  .snowcraft-hud__team-status {
    font-size: 16px;
    padding: 8px 12px;
  }

  .snowcraft-hud__selected-panel {
    bottom: 10px;
    left: 10px;
    max-width: calc(100% - 20px);
    min-width: 0;
    right: 10px;
    width: auto;
  }
}
`;
  }
}
