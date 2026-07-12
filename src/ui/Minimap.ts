import type { CameraView } from '../engine/CameraController';
import type { GameRenderer } from '../core/Game';
import { TEAM_COLORS } from '../game/config';
import { Team } from '../game/types';
import type { World } from '../game/World';

const MAX_SIZE = 150;
const PADDING = 6;
const PLAYER_COLOR = `#${TEAM_COLORS[Team.Player].toString(16).padStart(6, '0')}`;
const ENEMY_COLOR = `#${TEAM_COLORS[Team.Enemy].toString(16).padStart(6, '0')}`;

/**
 * Simple bottom-right minimap: draws the arena, a dot per living unit (blue = the
 * local hero's team, red = the enemy — POV-relative), and the current camera
 * viewport rectangle. Observes simulation data only (design §8); redrawn each
 * frame on a small 2D canvas. Shown during live play only.
 */
export class Minimap implements GameRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cssW: number;
  private readonly cssH: number;

  constructor(
    container: HTMLElement,
    private readonly world: World,
    private readonly getView: () => CameraView,
    private readonly isVisible: () => boolean,
  ) {
    const arena = world.arena;
    // Keep the arena's aspect ratio; fit within a MAX_SIZE box.
    const scale = MAX_SIZE / Math.max(arena.width, arena.height);
    this.cssW = Math.round(arena.width * scale);
    this.cssH = Math.round(arena.height * scale);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cssW * dpr;
    this.canvas.height = this.cssH * dpr;
    Object.assign(this.canvas.style, {
      position: 'absolute',
      right: '14px',
      bottom: '14px',
      width: `${this.cssW}px`,
      height: `${this.cssH}px`,
      borderRadius: '10px',
      border: '2px solid rgba(255, 255, 255, 0.85)',
      boxShadow: '0 6px 16px rgba(28, 50, 74, 0.22)',
      pointerEvents: 'none',
    });
    this.canvas.hidden = true;
    container.append(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Minimap: 2D canvas context unavailable');
    ctx.scale(dpr, dpr);
    this.ctx = ctx;
  }

  sync(): void {
    const visible = this.isVisible();
    this.canvas.hidden = !visible;
    if (!visible) return;

    const { ctx, cssW, cssH, world } = this;
    const arena = world.arena;

    ctx.clearRect(0, 0, cssW, cssH);
    // Arena background.
    ctx.fillStyle = 'rgba(233, 244, 255, 0.9)';
    ctx.fillRect(0, 0, cssW, cssH);

    const innerW = cssW - PADDING * 2;
    const innerH = cssH - PADDING * 2;
    const toX = (wx: number): number => PADDING + ((wx + arena.width / 2) / arena.width) * innerW;
    const toY = (wy: number): number => PADDING + ((wy + arena.height / 2) / arena.height) * innerH;

    // Current viewport rectangle.
    const view = this.getView();
    const vx = toX(view.x - view.halfX);
    const vy = toY(view.y - view.halfY);
    const vw = (view.halfX * 2 / arena.width) * innerW;
    const vh = (view.halfY * 2 / arena.height) * innerH;
    ctx.strokeStyle = 'rgba(40, 60, 84, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      Math.max(PADDING, vx),
      Math.max(PADDING, vy),
      Math.min(vw, innerW),
      Math.min(vh, innerH),
    );

    // Unit dots (POV-relative colours; the local hero is drawn larger + ringed).
    for (const player of world.players) {
      if (!player.alive) continue;
      const isLocal = player.team === Team.Player;
      const px = toX(player.position.x);
      const py = toY(player.position.y);
      ctx.beginPath();
      ctx.arc(px, py, isLocal ? 3.5 : 2.6, 0, Math.PI * 2);
      ctx.fillStyle = isLocal ? PLAYER_COLOR : ENEMY_COLOR;
      ctx.fill();
      if (isLocal) {
        ctx.beginPath();
        ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  dispose(): void {
    this.canvas.remove();
  }
}
