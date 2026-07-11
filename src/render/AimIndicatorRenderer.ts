import * as THREE from 'three';
import type { GameRenderer } from '../core/Game';
import type { AssetManager } from '../engine/AssetManager';
import { AIM } from '../game/config';
import { sampleThrowTrajectory, type TrajectoryPoint } from '../game/trajectory';
import { PlayerState, Team, type Player } from '../game/types';
import type { World } from '../game/World';
import { toThree } from './coords';

const MAX_DOTS_PER_THROW = 18;
const DOT_GROUND_LIFT = 0.02;

type OverlayMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

/**
 * World-space aiming preview (design §11). While a selected friendly unit
 * charges a throw it draws:
 *  - a fixed-radius aim handle (a beam from the unit to a reticle) that acts as
 *    a large, easy-to-read rotation indicator, and
 *  - the exact ballistic arc the snowball will follow (dots that rise/fall in
 *    3D) ending in a ring on the predicted landing spot.
 * Everything shifts from cool blue to hot orange as power builds.
 *
 * Purely observes simulation data (design §8): it reads player position,
 * `aimDirection` and `throwCharge` and never mutates the world. Meshes are
 * pooled and reused, so there are no per-frame allocations.
 */
export class AimIndicatorRenderer implements GameRenderer {
  private readonly group = new THREE.Group();
  private readonly tmp = new THREE.Vector3();
  private readonly dots: OverlayMesh[] = [];
  private readonly landings: OverlayMesh[] = [];
  private readonly beams: OverlayMesh[] = [];
  private readonly reticles: OverlayMesh[] = [];
  private readonly samples: TrajectoryPoint[] = [];

  private readonly coolColor = new THREE.Color(0x6ec6ff);
  private readonly hotColor = new THREE.Color(0xff6a3d);
  private readonly scratchColor = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: AssetManager,
    private readonly world: World,
  ) {
    this.group.name = 'AimIndicatorRenderer';
    this.scene.add(this.group);
  }

  sync(): void {
    let usedDots = 0;
    let usedThrows = 0;

    for (const player of this.world.players) {
      if (!this.isCharging(player)) continue;

      const count = sampleThrowTrajectory(
        player.position.x,
        player.position.y,
        player.aimDirection.x,
        player.aimDirection.y,
        player.throwCharge,
        this.samples,
      );
      if (count < 2) continue;

      const color = this.powerColor(player.throwCharge);
      usedDots = this.layoutDots(count, color, usedDots);
      this.layoutAimHandle(player, color, usedThrows);
      this.layoutLanding(this.samples[count - 1], player.throwCharge, color, usedThrows);
      usedThrows++;
    }

    this.hideFrom(this.dots, usedDots);
    this.hideFrom(this.beams, usedThrows);
    this.hideFrom(this.reticles, usedThrows);
    this.hideFrom(this.landings, usedThrows);
  }

  dispose(): void {
    for (const mesh of [...this.dots, ...this.landings, ...this.beams, ...this.reticles]) {
      mesh.material.dispose();
    }
    this.scene.remove(this.group);
    this.group.clear();
  }

  private isCharging(player: Player): boolean {
    return (
      player.team === Team.Player &&
      player.alive &&
      player.selected &&
      player.state === PlayerState.PreparingThrow
    );
  }

  private layoutDots(count: number, color: THREE.Color, used: number): number {
    const stride = Math.max(1, Math.ceil(count / MAX_DOTS_PER_THROW));
    // Skip the final sample so dots don't overlap the landing ring.
    for (let i = 0; i < count - 1; i += stride) {
      const point = this.samples[i];
      const dot = this.acquire(this.dots, used, 'aim-dot', 0.85, () => {
        const geo = new THREE.CircleGeometry(0.1, 12);
        geo.rotateX(-Math.PI / 2);
        return geo;
      });
      toThree(this.tmp, point.x, point.y, point.height + DOT_GROUND_LIFT);
      dot.position.copy(this.tmp);
      dot.material.color.copy(color);
      dot.visible = true;
      used++;
    }
    return used;
  }

  /** Draws the fixed-radius rotation handle: a beam from the unit to a reticle. */
  private layoutAimHandle(player: Player, color: THREE.Color, index: number): void {
    const originX = player.position.x;
    const originY = player.position.y;
    const tipX = originX + player.aimDirection.x * AIM.reticleRadius;
    const tipY = originY + player.aimDirection.y * AIM.reticleRadius;

    const beam = this.acquire(this.beams, index, 'aim-beam', 0.4, () => {
      const geo = new THREE.PlaneGeometry(1, 0.12);
      geo.rotateX(-Math.PI / 2);
      return geo;
    });
    toThree(this.tmp, (originX + tipX) / 2, (originY + tipY) / 2, 0.015);
    beam.position.copy(this.tmp);
    beam.rotation.y = -Math.atan2(player.aimDirection.y, player.aimDirection.x);
    beam.scale.set(AIM.reticleRadius, 1, 1);
    beam.material.color.copy(color);
    beam.visible = true;

    const reticle = this.acquire(this.reticles, index, 'aim-reticle', 0.9, () => {
      const geo = new THREE.RingGeometry(0.18, 0.32, 22);
      geo.rotateX(-Math.PI / 2);
      return geo;
    });
    toThree(this.tmp, tipX, tipY, 0.02);
    reticle.position.copy(this.tmp);
    reticle.material.color.copy(color);
    reticle.visible = true;
  }

  private layoutLanding(landing: TrajectoryPoint, charge: number, color: THREE.Color, index: number): void {
    const ring = this.acquire(this.landings, index, 'aim-landing-ring', 0.85, () => {
      const geo = new THREE.RingGeometry(0.34, 0.5, 28);
      geo.rotateX(-Math.PI / 2);
      return geo;
    });
    const pulse = 1 + Math.sin(this.world.time * 8) * 0.08;
    const scale = (0.75 + charge * 0.5) * pulse;
    toThree(this.tmp, landing.x, landing.y, 0.03);
    ring.position.copy(this.tmp);
    ring.scale.setScalar(scale);
    ring.material.color.copy(color);
    ring.visible = true;
  }

  private acquire(
    pool: OverlayMesh[],
    index: number,
    geometryKey: string,
    opacity: number,
    factory: () => THREE.BufferGeometry,
  ): OverlayMesh {
    const existing = pool[index];
    if (existing) return existing;

    const mesh = new THREE.Mesh(this.assets.geometry(geometryKey, factory), this.newOverlayMaterial(opacity));
    pool[index] = mesh;
    this.group.add(mesh);
    return mesh;
  }

  private newOverlayMaterial(opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  private powerColor(charge: number): THREE.Color {
    return this.scratchColor.copy(this.coolColor).lerp(this.hotColor, Math.min(1, Math.max(0, charge)));
  }

  private hideFrom(meshes: OverlayMesh[], from: number): void {
    for (let i = from; i < meshes.length; i++) {
      meshes[i].visible = false;
    }
  }
}
