import * as THREE from 'three';
import type { GameRenderer } from '../core/Game';
import type { AssetManager } from '../engine/AssetManager';
import { PLAYER, TEAM_COLORS } from '../game/config';
import { PlayerState, type Player } from '../game/types';
import type { World } from '../game/World';
import { toThree } from './coords';

interface PlayerView {
  readonly root: THREE.Group;
  readonly figure: THREE.Group;
  readonly ring: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly leftArm: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly rightArm: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
}

/**
 * Procedural Three.js renderer for child units. It observes simulation players
 * and mirrors them with lightweight cartoon primitives without mutating world
 * state.
 */
export class PlayerRenderer implements GameRenderer {
  private readonly group = new THREE.Group();
  private readonly tmp = new THREE.Vector3();
  private readonly activeIds = new Set<number>();
  private readonly views = new Map<number, PlayerView>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: AssetManager,
    private readonly world: World,
  ) {
    this.group.name = 'PlayerRenderer';
    this.scene.add(this.group);

    for (const player of this.world.players) {
      this.ensureView(player);
    }
  }

  sync(alpha: number): void {
    this.activeIds.clear();

    for (const player of this.world.players) {
      this.activeIds.add(player.id);
      this.updateView(this.ensureView(player), player, alpha);
    }

    for (const [id, view] of this.views) {
      if (!this.activeIds.has(id)) {
        this.removeView(id, view);
      }
    }
  }

  dispose(): void {
    for (const [id, view] of this.views) {
      this.removeView(id, view);
    }
    this.scene.remove(this.group);
  }

  private ensureView(player: Player): PlayerView {
    const existing = this.views.get(player.id);
    if (existing) return existing;

    const view = this.buildView(player);
    this.views.set(player.id, view);
    this.group.add(view.root);
    return view;
  }

  private buildView(player: Player): PlayerView {
    const root = new THREE.Group();
    root.name = `player-${player.id}`;

    const figure = new THREE.Group();
    const teamColor = TEAM_COLORS[player.team];
    const bodyMat = this.assets.standardMaterial(teamColor);
    const accentMat = this.assets.standardMaterial(this.darken(teamColor));
    const skinMat = this.assets.standardMaterial(0xffd6a5);
    const bootMat = this.assets.standardMaterial(0x27313d);

    const ring = new THREE.Mesh(
      this.assets.geometry('player-selection-ring', () => {
        const geo = new THREE.RingGeometry(0.58, 0.72, 32);
        geo.rotateX(-Math.PI / 2);
        return geo;
      }),
      this.assets.material(
        'player-selection-ring-material',
        () =>
          new THREE.MeshBasicMaterial({
            color: 0xfff06a,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
      ),
    );
    ring.position.y = 0.025;
    ring.visible = false;
    root.add(ring);

    const body = this.shadowMesh(
      this.assets.geometry('player-body', () => new THREE.CylinderGeometry(0.31, 0.36, 0.62, 12)),
      bodyMat,
    );
    body.position.y = 0.45;
    figure.add(body);

    const belly = this.shadowMesh(
      this.assets.geometry('player-belly', () => new THREE.SphereGeometry(0.37, 14, 12)),
      bodyMat,
    );
    belly.scale.y = 0.78;
    belly.position.y = 0.28;
    figure.add(belly);

    const head = this.shadowMesh(
      this.assets.geometry('player-head', () => new THREE.SphereGeometry(0.25, 14, 12)),
      skinMat,
    );
    head.position.y = 0.95;
    figure.add(head);

    const nose = this.shadowMesh(
      this.assets.geometry('player-nose', () => new THREE.ConeGeometry(0.055, 0.18, 8)),
      this.assets.standardMaterial(0xff9f43),
    );
    nose.position.set(0.26, 0.96, 0);
    nose.rotation.z = -Math.PI / 2;
    figure.add(nose);

    const scarf = this.shadowMesh(
      this.assets.geometry('player-scarf', () => new THREE.BoxGeometry(0.5, 0.1, 0.16)),
      accentMat,
    );
    scarf.position.set(0.04, 0.75, 0);
    figure.add(scarf);

    const hat = this.shadowMesh(
      this.assets.geometry('player-hat', () => new THREE.ConeGeometry(0.22, 0.28, 12)),
      accentMat,
    );
    hat.position.y = 1.22;
    figure.add(hat);

    const leftArm = this.buildArm(bodyMat, -0.35);
    const rightArm = this.buildArm(bodyMat, 0.35);
    figure.add(leftArm, rightArm);

    const leftBoot = this.buildBoot(bootMat, -0.16);
    const rightBoot = this.buildBoot(bootMat, 0.16);
    figure.add(leftBoot, rightBoot);

    root.add(figure);
    return { root, figure, ring, leftArm, rightArm };
  }

  private buildArm(
    mat: THREE.Material,
    z: number,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
    const arm = this.shadowMesh(
      this.assets.geometry('player-arm', () => new THREE.CylinderGeometry(0.055, 0.07, 0.42, 8)),
      mat,
    );
    arm.position.set(0.02, 0.52, z);
    arm.rotation.z = z < 0 ? -0.22 : 0.22;
    return arm;
  }

  private buildBoot(
    mat: THREE.Material,
    z: number,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
    const boot = this.shadowMesh(
      this.assets.geometry('player-boot', () => new THREE.SphereGeometry(0.12, 8, 8)),
      mat,
    );
    boot.scale.set(1.25, 0.55, 0.9);
    boot.position.set(0.1, 0.07, z);
    return boot;
  }

  private updateView(view: PlayerView, player: Player, alpha: number): void {
    const defeated = !player.alive || player.state === PlayerState.Defeated;
    const scale = player.radius / PLAYER.radius;

    toThree(this.tmp, player.position.x, player.position.y, 0);
    view.root.position.copy(this.tmp);
    view.root.rotation.y = -player.rotation;
    view.root.scale.setScalar(scale);

    view.ring.visible = player.selected && !defeated;

    if (defeated) {
      view.figure.position.y = 0.16;
      view.figure.rotation.set(0, 0, Math.PI / 2);
      view.figure.scale.set(1, 0.55, 1);
      return;
    }

    const renderTime = player.animationTime + alpha / 60;
    this.applyAnimation(view, player, renderTime);
  }

  private applyAnimation(view: PlayerView, player: Player, renderTime: number): void {
    view.figure.position.y = 0;
    view.figure.rotation.set(0, 0, 0);
    view.figure.scale.set(1, 1, 1);
    this.setArmPose(view, 0, 0, 0);

    switch (player.currentAnimation) {
      case 'idle':
        this.applyIdle(view, renderTime);
        break;
      case 'walk':
        this.applyWalk(view, player, renderTime);
        break;
      case 'throw':
        this.applyThrow(view, renderTime);
        break;
      case 'hit':
        this.applyHit(view, renderTime);
        break;
      case 'victory':
        this.applyVictory(view, renderTime);
        break;
      case 'defeated':
        break;
    }
  }

  private applyIdle(view: PlayerView, renderTime: number): void {
    const phase = Math.sin(renderTime * 3);
    view.figure.position.y = 0.012 + phase * 0.01;
    view.figure.scale.set(1 + phase * 0.012, 1 - phase * 0.008, 1 + phase * 0.012);
  }

  private applyWalk(view: PlayerView, player: Player, renderTime: number): void {
    const speedScale = Math.min(player.velocity.length() / PLAYER.moveSpeed, 1);
    const phase = Math.sin(renderTime * 12);
    const bob = Math.abs(phase) * 0.04 * speedScale;
    const armSwing = phase * 0.34 * speedScale;

    view.figure.position.y = bob;
    view.figure.rotation.x = phase * 0.08 * speedScale;
    this.setArmPose(view, armSwing, -armSwing, 0);
  }

  private applyThrow(view: PlayerView, renderTime: number): void {
    const t = Math.min(renderTime, 0.55);
    const windup = Math.min(t / 0.22, 1);
    const release = Math.min(Math.max((t - 0.22) / 0.16, 0), 1);
    const lean = -0.26 * (1 - release) * windup + 0.22 * release * (1 - release);

    view.figure.rotation.z = lean;
    view.figure.position.y = 0.01 * windup;
    this.setArmPose(view, -0.18 - windup * 0.42 + release * 0.65, 0.12 + windup * 0.36, 0.08 * windup);
  }

  private applyHit(view: PlayerView, renderTime: number): void {
    const recoil = Math.max(0, 1 - renderTime / 0.35);
    const eased = recoil * recoil;

    view.figure.rotation.z = 0.34 * eased;
    view.figure.position.y = 0.025 * eased;
    view.figure.scale.set(1 + 0.08 * eased, 1 - 0.12 * eased, 1 + 0.05 * eased);
    this.setArmPose(view, -0.32 * eased, 0.32 * eased, 0);
  }

  private applyVictory(view: PlayerView, renderTime: number): void {
    const phase = Math.sin(renderTime * 9);
    const hop = Math.max(0, phase) * 0.08;

    view.figure.position.y = hop;
    view.figure.rotation.y = renderTime * 2.4;
    view.figure.rotation.z = Math.sin(renderTime * 6) * 0.08;
    this.setArmPose(view, -0.85 + phase * 0.12, 0.85 - phase * 0.12, 0.18);
  }

  private setArmPose(view: PlayerView, leftX: number, rightX: number, lift: number): void {
    view.leftArm.rotation.x = leftX;
    view.rightArm.rotation.x = rightX;
    view.leftArm.rotation.y = lift;
    view.rightArm.rotation.y = -lift;
  }

  private shadowMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    return mesh;
  }

  private removeView(id: number, view: PlayerView): void {
    this.group.remove(view.root);
    this.views.delete(id);
  }

  private darken(color: number): number {
    return new THREE.Color(color).offsetHSL(0, 0.05, -0.18).getHex();
  }
}
