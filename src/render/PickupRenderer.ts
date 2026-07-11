import * as THREE from 'three';
import type { GameRenderer } from '../core/Game';
import type { AssetManager } from '../engine/AssetManager';
import type { EntityId } from '../ecs/Entity';
import { type BuffType } from '../game/types';
import type { World } from '../game/World';
import { toThree } from './coords';

const BUFF_COLOR: Record<BuffType, number> = {
  life: 0xff5a7a,
  immunity: 0x4fd6ff,
  speed: 0x7be36a,
};

interface PickupView {
  readonly root: THREE.Group;
  readonly icon: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

/**
 * Renders collectible pickups as bobbing, spinning, colour-coded gems and draws
 * a soft ground ring under any unit currently carrying a buff (cyan = immunity,
 * green = speed). Observes simulation data only (design §8); pooled per id.
 */
export class PickupRenderer implements GameRenderer {
  private readonly group = new THREE.Group();
  private readonly tmp = new THREE.Vector3();
  private readonly scratch = new THREE.Color();
  private readonly pickupViews = new Map<EntityId, PickupView>();
  private readonly unitRings = new Map<EntityId, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: AssetManager,
    private readonly world: World,
  ) {
    this.group.name = 'PickupRenderer';
    this.scene.add(this.group);
  }

  sync(): void {
    const time = this.world.time;

    for (const pickup of this.world.pickups) {
      const view = this.ensurePickupView(pickup.id);
      view.root.visible = pickup.active;
      if (!pickup.active) continue;

      const color = BUFF_COLOR[pickup.type];
      toThree(this.tmp, pickup.position.x, pickup.position.y, 0);
      view.root.position.copy(this.tmp);
      view.icon.position.y = 0.6 + Math.sin(time * 3 + pickup.id) * 0.12;
      view.icon.rotation.y = time * 1.6;
      view.icon.material.color.setHex(color);
      view.icon.material.emissive.copy(this.scratch.setHex(color)).multiplyScalar(0.35);
      view.ring.material.color.setHex(color);
      view.ring.scale.setScalar(1 + Math.sin(time * 4 + pickup.id) * 0.08);
    }

    for (const player of this.world.players) {
      const active = player.alive && (player.immunityTimer > 0 || player.speedTimer > 0);
      const ring = this.ensureUnitRing(player.id);
      ring.visible = active;
      if (!active) continue;

      const color = player.immunityTimer > 0 ? BUFF_COLOR.immunity : BUFF_COLOR.speed;
      toThree(this.tmp, player.position.x, player.position.y, 0.04);
      ring.position.copy(this.tmp);
      ring.material.color.setHex(color);
      ring.scale.setScalar(1 + Math.sin(time * 6 + player.id) * 0.06);
    }
  }

  dispose(): void {
    for (const view of this.pickupViews.values()) {
      view.icon.material.dispose();
      view.ring.material.dispose();
    }
    for (const ring of this.unitRings.values()) ring.material.dispose();
    this.scene.remove(this.group);
    this.group.clear();
  }

  private ensurePickupView(id: EntityId): PickupView {
    const existing = this.pickupViews.get(id);
    if (existing) return existing;

    const root = new THREE.Group();
    const icon = new THREE.Mesh(
      this.assets.geometry('pickup-icon', () => new THREE.OctahedronGeometry(0.34, 0)),
      new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 }),
    );
    icon.castShadow = true;
    const ring = new THREE.Mesh(
      this.assets.geometry('pickup-ground-ring', () => {
        const geo = new THREE.RingGeometry(0.38, 0.56, 24);
        geo.rotateX(-Math.PI / 2);
        return geo;
      }),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.position.y = 0.03;
    root.add(icon, ring);
    this.group.add(root);

    const view: PickupView = { root, icon, ring };
    this.pickupViews.set(id, view);
    return view;
  }

  private ensureUnitRing(id: EntityId): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    const existing = this.unitRings.get(id);
    if (existing) return existing;

    const ring = new THREE.Mesh(
      this.assets.geometry('buff-unit-ring', () => {
        const geo = new THREE.RingGeometry(0.6, 0.74, 28);
        geo.rotateX(-Math.PI / 2);
        return geo;
      }),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.visible = false;
    this.group.add(ring);
    this.unitRings.set(id, ring);
    return ring;
  }
}
