import * as THREE from 'three';
import type { GameRenderer } from '../core/Game';
import type { AssetManager } from '../engine/AssetManager';
import type { EntityId } from '../ecs/Entity';
import { Team, type Player } from '../game/types';
import type { World } from '../game/World';
import { toThree } from './coords';

const GROUND_LIFT = 0.03;
const ORDER_POP_DURATION = 0.35;
const TARGET_MOVED_EPSILON_SQ = 0.05 * 0.05;

interface NavView {
  readonly arrow: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly marker: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  markerActive: boolean;
  targetX: number;
  targetY: number;
  orderTime: number;
}

/**
 * Navigation affordances for the player's squad (design §11). Draws a flat
 * ground arrow under each friendly unit showing which way it faces (emphasised
 * while selected) and a ground ring on each unit's current move destination,
 * with a brief "pop" when a new move order is issued.
 *
 * Read-only over the simulation (design §8): it observes `rotation`, `selected`
 * and `moveTarget` and never mutates the world. One arrow/marker pair is pooled
 * per unit, so there are no per-frame allocations.
 */
export class NavIndicatorRenderer implements GameRenderer {
  private readonly group = new THREE.Group();
  private readonly tmp = new THREE.Vector3();
  private readonly views = new Map<EntityId, NavView>();

  private readonly arrowSelectedMat: THREE.MeshBasicMaterial;
  private readonly arrowIdleMat: THREE.MeshBasicMaterial;
  private readonly markerMat: THREE.MeshBasicMaterial;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: AssetManager,
    private readonly world: World,
  ) {
    this.group.name = 'NavIndicatorRenderer';
    this.scene.add(this.group);

    this.arrowSelectedMat = new THREE.MeshBasicMaterial({
      color: 0x4fb0ff,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.arrowIdleMat = new THREE.MeshBasicMaterial({
      color: 0x4fb0ff,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.markerMat = new THREE.MeshBasicMaterial({
      color: 0x7be3a4,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  sync(): void {
    for (const player of this.world.players) {
      if (player.team !== Team.Player) continue;
      this.updateView(this.ensureView(player), player);
    }
  }

  dispose(): void {
    this.arrowSelectedMat.dispose();
    this.arrowIdleMat.dispose();
    this.markerMat.dispose();
    this.scene.remove(this.group);
    this.group.clear();
    this.views.clear();
  }

  private updateView(view: NavView, player: Player): void {
    const show = player.alive;
    view.arrow.visible = show;
    if (show) {
      toThree(this.tmp, player.position.x, player.position.y, GROUND_LIFT);
      view.arrow.position.copy(this.tmp);
      view.arrow.rotation.y = -player.rotation;
      view.arrow.material = player.selected ? this.arrowSelectedMat : this.arrowIdleMat;
    }

    this.updateMarker(view, player);
  }

  private updateMarker(view: NavView, player: Player): void {
    const target = player.alive ? player.moveTarget : null;
    if (!target) {
      view.marker.visible = false;
      view.markerActive = false;
      return;
    }

    const dx = target.x - view.targetX;
    const dy = target.y - view.targetY;
    if (!view.markerActive || dx * dx + dy * dy > TARGET_MOVED_EPSILON_SQ) {
      view.orderTime = this.world.time;
      view.targetX = target.x;
      view.targetY = target.y;
      view.markerActive = true;
    }

    const age = this.world.time - view.orderTime;
    const pop = age < ORDER_POP_DURATION ? 1 + (1 - age / ORDER_POP_DURATION) * 0.6 : 1;
    const pulse = 1 + Math.sin(this.world.time * 6) * 0.06;

    toThree(this.tmp, target.x, target.y, GROUND_LIFT);
    view.marker.position.copy(this.tmp);
    view.marker.scale.setScalar(pop * pulse);
    view.marker.visible = true;
  }

  private ensureView(player: Player): NavView {
    const existing = this.views.get(player.id);
    if (existing) return existing;

    const arrow = new THREE.Mesh(this.facingArrowGeometry(), this.arrowIdleMat);
    const marker = new THREE.Mesh(this.moveMarkerGeometry(), this.markerMat);
    marker.visible = false;
    this.group.add(arrow, marker);

    const view: NavView = {
      arrow,
      marker,
      markerActive: false,
      targetX: 0,
      targetY: 0,
      orderTime: 0,
    };
    this.views.set(player.id, view);
    return view;
  }

  private facingArrowGeometry(): THREE.BufferGeometry {
    return this.assets.geometry('nav-facing-arrow', () => {
      const geo = new THREE.BufferGeometry();
      // Flat chevron on the ground plane, pointing toward local +X. Sized
      // generously so facing/rotation reads clearly from the angled camera.
      const positions = new Float32Array([1.35, 0, 0, 0.6, 0, -0.42, 0.6, 0, 0.42]);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex([0, 1, 2]);
      geo.computeVertexNormals();
      return geo;
    });
  }

  private moveMarkerGeometry(): THREE.BufferGeometry {
    return this.assets.geometry('nav-move-ring', () => {
      const geo = new THREE.RingGeometry(0.3, 0.44, 24);
      geo.rotateX(-Math.PI / 2);
      return geo;
    });
  }
}
