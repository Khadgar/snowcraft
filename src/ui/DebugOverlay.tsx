import * as THREE from 'three';
import { render, type JSX } from 'preact';
import type { GameRenderer } from '../core/Game';
import type { World } from '../game/World';
import { toThree } from '../render/coords';
import { hasLineOfSight } from '../physics/LineOfSight';
import type { Shape } from '../physics/shapes';
import { Team, type Player } from '../game/types';
import styles from './DebugOverlay.module.css';

interface DebugToggles {
  collision: boolean;
  cover: boolean;
  hitboxes: boolean;
  moveTargets: boolean;
  aiTargets: boolean;
  projectiles: boolean;
}

/** Ordered toggle definitions, driving both the keybindings and the panel rows. */
const TOGGLE_ROWS: ReadonlyArray<{ key: string; field: keyof DebugToggles; label: string }> = [
  { key: '1', field: 'collision', label: 'collision' },
  { key: '2', field: 'cover', label: 'cover' },
  { key: '3', field: 'hitboxes', label: 'hitboxes' },
  { key: '4', field: 'moveTargets', label: 'moveTargets' },
  { key: '5', field: 'aiTargets', label: 'aiTargets' },
  { key: '6', field: 'projectiles', label: 'projectiles' },
];

/** Live DOM nodes for the per-frame stat lines (written by {@link DebugOverlay.sync}). */
interface PanelRefs {
  fps: HTMLElement;
  counts: HTMLElement;
}

/** Declarative debug panel: fixed title + per-frame stat lines (refs) + toggle rows. */
function DebugPanel({ toggles, refs }: { toggles: DebugToggles; refs: PanelRefs }): JSX.Element {
  return (
    <div class={styles.panel}>
      <div class={styles.title}>DEBUG (` to toggle)</div>
      <div class={styles.line} ref={(el) => { if (el) refs.fps = el; }} />
      <div class={styles.line} ref={(el) => { if (el) refs.counts = el; }} />
      {TOGGLE_ROWS.map((row) => (
        <div class={styles.toggle} key={row.field}>
          [{row.key}] {row.label}{' '}
          <span class={toggles[row.field] ? styles.on : styles.off}>
            {toggles[row.field] ? 'on' : 'off'}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Toggleable developer overlay (design §27): draws collision shapes, cover
 * volumes, hitboxes/selection radius, move-order lines, AI target lines and
 * projectile positions in the 3D scene, plus a DOM panel (Preact) with
 * FPS/frame time and toggle state.
 *
 * Controls: backquote (`) toggles the overlay; number keys 1-6 toggle the
 * individual categories while it is active. Off by default (zero cost).
 */
export class DebugOverlay implements GameRenderer {
  private enabled = false;
  private readonly group = new THREE.Group();
  private readonly host: HTMLDivElement;
  private readonly refs = {} as PanelRefs;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  private readonly toggles: DebugToggles = {
    collision: true,
    cover: false,
    hitboxes: true,
    moveTargets: true,
    aiTargets: true,
    projectiles: true,
  };

  private readonly materials = {
    collision: new THREE.LineBasicMaterial({ color: 0xffd23f }),
    cover: new THREE.LineBasicMaterial({ color: 0x36e0d0 }),
    hitbox: new THREE.LineBasicMaterial({ color: 0x51e05a }),
    moveTarget: new THREE.LineBasicMaterial({ color: 0xffffff }),
    aiTarget: new THREE.LineBasicMaterial({ color: 0xff5a4d }),
    projectile: new THREE.LineBasicMaterial({ color: 0xffa23f }),
  };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: World,
    container: HTMLElement,
    private readonly getStats: () => { fps: number; frameTimeMs: number },
  ) {
    this.group.visible = false;
    scene.add(this.group);

    this.host = document.createElement('div');
    this.host.style.display = 'none';
    container.appendChild(this.host);
    this.renderPanel();

    window.addEventListener('keydown', this.onKeyDown);
  }

  private renderPanel(): void {
    render(<DebugPanel toggles={this.toggles} refs={this.refs} />, this.host);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Backquote') {
      this.enabled = !this.enabled;
      this.group.visible = this.enabled;
      this.host.style.display = this.enabled ? 'block' : 'none';
      return;
    }
    if (!this.enabled) return;

    const row = TOGGLE_ROWS.find((r) => e.code === `Digit${r.key}`);
    if (!row) return;
    this.toggles[row.field] = !this.toggles[row.field];
    this.renderPanel();
  };

  sync(): void {
    if (!this.enabled) return;
    this.clearGroup();

    if (this.toggles.collision || this.toggles.cover) {
      for (const obstacle of this.world.arena.obstacles) {
        if (this.toggles.collision) this.addShape(obstacle.collision, this.materials.collision, 0.05);
        if (this.toggles.cover && obstacle.cover) {
          this.addShape(obstacle.cover, this.materials.cover, 0.06);
        }
      }
    }

    for (const player of this.world.players) {
      if (!player.alive) continue;
      if (this.toggles.hitboxes) {
        this.addCircle(player.position.x, player.position.y, player.radius, this.materials.hitbox, 0.04);
      }
      if (this.toggles.moveTargets && player.moveTarget) {
        this.addSegment(
          player.position.x,
          player.position.y,
          player.moveTarget.x,
          player.moveTarget.y,
          this.materials.moveTarget,
        );
      }
    }

    if (this.toggles.aiTargets) {
      this.drawAiTargets();
    }

    if (this.toggles.projectiles) {
      for (const s of this.world.snowballs) {
        if (!s.alive) continue;
        this.addCircle(s.position.x, s.position.y, s.radius, this.materials.projectile, s.height);
      }
    }

    const stats = this.getStats();
    this.refs.fps.textContent = `fps ${stats.fps.toFixed(0)}  frame ${stats.frameTimeMs.toFixed(1)}ms`;
    this.refs.counts.textContent =
      `players ${this.world.countLiving(Team.Player)}  enemies ${this.world.countLiving(Team.Enemy)}` +
      `  snowballs ${this.world.snowballs.length}`;
  }

  private drawAiTargets(): void {
    const players = this.world.players.filter((p) => p.alive && p.team === Team.Player);
    for (const enemy of this.world.players) {
      if (!enemy.alive || enemy.team !== Team.Enemy) continue;
      const target = this.nearestVisible(enemy, players);
      if (target) {
        this.addSegment(
          enemy.position.x,
          enemy.position.y,
          target.position.x,
          target.position.y,
          this.materials.aiTarget,
        );
      }
    }
  }

  private nearestVisible(from: Player, candidates: Player[]): Player | null {
    let best: Player | null = null;
    let bestSq = Infinity;
    for (const c of candidates) {
      if (!hasLineOfSight(this.world.arena, from.position.x, from.position.y, c.position.x, c.position.y)) {
        continue;
      }
      const d = from.position.distanceToSq(c.position);
      if (d < bestSq) {
        bestSq = d;
        best = c;
      }
    }
    return best;
  }

  private addShape(shape: Shape, material: THREE.LineBasicMaterial, y: number): void {
    switch (shape.kind) {
      case 'circle':
        this.addCircle(shape.x, shape.y, shape.radius, material, y);
        break;
      case 'rect':
        this.addRect(shape.x, shape.y, shape.halfW, shape.halfH, material, y);
        break;
      case 'capsule':
        this.addSegment(shape.x1, shape.y1, shape.x2, shape.y2, material, y);
        break;
    }
  }

  private addCircle(
    x: number,
    y: number,
    radius: number,
    material: THREE.LineBasicMaterial,
    height: number,
  ): void {
    const segments = 24;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(x + Math.cos(a) * radius, height, y + Math.sin(a) * radius));
    }
    this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  private addRect(
    x: number,
    y: number,
    halfW: number,
    halfH: number,
    material: THREE.LineBasicMaterial,
    height: number,
  ): void {
    const points = [
      new THREE.Vector3(x - halfW, height, y - halfH),
      new THREE.Vector3(x + halfW, height, y - halfH),
      new THREE.Vector3(x + halfW, height, y + halfH),
      new THREE.Vector3(x - halfW, height, y + halfH),
      new THREE.Vector3(x - halfW, height, y - halfH),
    ];
    this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  private addSegment(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    material: THREE.LineBasicMaterial,
    height = 0.08,
  ): void {
    toThree(this.tmpA, ax, ay, height);
    toThree(this.tmpB, bx, by, height);
    this.group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([this.tmpA.clone(), this.tmpB.clone()]),
        material,
      ),
    );
  }

  private clearGroup(): void {
    for (const child of this.group.children) {
      if (child instanceof THREE.Line) child.geometry.dispose();
    }
    this.group.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.clearGroup();
    this.scene.remove(this.group);
    for (const mat of Object.values(this.materials)) mat.dispose();
    render(null, this.host);
    this.host.remove();
  }
}
