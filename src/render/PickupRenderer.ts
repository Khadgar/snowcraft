import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { GameRenderer } from '../core/Game';
import { BUFF_COLORS } from '../game/config';
import type { AssetManager } from '../engine/AssetManager';
import type { EntityId } from '../ecs/Entity';
import { type BuffType, type Pickup } from '../game/types';
import type { World } from '../game/World';
import { toThree } from './coords';

const POP_POOL_SIZE = 8;
/** Seconds a collect "pop" icon takes to rise and fade. */
const POP_DURATION = 0.7;
/** World units the pop icon rises over its lifetime. */
const POP_RISE = 1.5;

interface PickupView {
  readonly root: THREE.Group;
  readonly icon: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** Which buff shape the icon mesh is currently showing (pickups are pooled). */
  type: BuffType;
}

interface PopSlot {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  startTime: number;
}

/**
 * Renders collectible pickups as bobbing, spinning, colour-coded icons — a
 * shield (immunity), heart (life) and lightning bolt (speed) — draws a soft
 * ground ring under any unit currently carrying a buff (cyan = immunity,
 * green = speed), and pops a rising, fading icon at the spot a buff is
 * collected. Observes simulation data only (design §8); pooled per id.
 */
export class PickupRenderer implements GameRenderer {
  private readonly group = new THREE.Group();
  private readonly tmp = new THREE.Vector3();
  private readonly scratch = new THREE.Color();
  private readonly pickupViews = new Map<EntityId, PickupView>();
  private readonly unitRings = new Map<EntityId, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>();
  private readonly popSlots: PopSlot[] = [];
  private readonly offBuffPickedUp: () => void;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: AssetManager,
    private readonly world: World,
    events: EventBus,
  ) {
    this.group.name = 'PickupRenderer';
    this.scene.add(this.group);

    for (let i = 0; i < POP_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(
        this.iconGeometry('immunity'),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.popSlots.push({ mesh, active: false, startTime: 0 });
    }

    this.offBuffPickedUp = events.on('BuffPickedUp', (event) => {
      this.spawnPop(event.buff, event.x, event.y);
    });
  }

  sync(): void {
    const time = this.world.time;

    for (const pickup of this.world.pickups) {
      const view = this.ensurePickupView(pickup);
      view.root.visible = pickup.active;
      if (!pickup.active) continue;

      if (view.type !== pickup.type) {
        view.icon.geometry = this.iconGeometry(pickup.type);
        view.type = pickup.type;
      }

      const color = BUFF_COLORS[pickup.type];
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

      const color = player.immunityTimer > 0 ? BUFF_COLORS.immunity : BUFF_COLORS.speed;
      toThree(this.tmp, player.position.x, player.position.y, 0.04);
      ring.position.copy(this.tmp);
      ring.material.color.setHex(color);
      ring.scale.setScalar(1 + Math.sin(time * 6 + player.id) * 0.06);
    }

    this.updatePops(time);
  }

  dispose(): void {
    this.offBuffPickedUp();
    for (const view of this.pickupViews.values()) {
      view.icon.material.dispose();
      view.ring.material.dispose();
    }
    for (const ring of this.unitRings.values()) ring.material.dispose();
    for (const pop of this.popSlots) pop.mesh.material.dispose();
    this.scene.remove(this.group);
    this.group.clear();
  }

  private spawnPop(type: BuffType, x: number, y: number): void {
    for (const pop of this.popSlots) {
      if (pop.active) continue;
      pop.active = true;
      pop.startTime = this.world.time;
      pop.mesh.geometry = this.iconGeometry(type);
      pop.mesh.material.color.setHex(BUFF_COLORS[type]);
      pop.mesh.material.opacity = 1;
      toThree(this.tmp, x, y, 0.9);
      pop.mesh.position.copy(this.tmp);
      pop.mesh.scale.setScalar(0.6);
      pop.mesh.visible = true;
      return;
    }
  }

  private updatePops(time: number): void {
    for (const pop of this.popSlots) {
      if (!pop.active) continue;

      const t = (time - pop.startTime) / POP_DURATION;
      if (t >= 1 || t < 0) {
        pop.active = false;
        pop.mesh.visible = false;
        pop.mesh.material.opacity = 0;
        continue;
      }

      pop.mesh.position.y = 0.9 + t * POP_RISE;
      pop.mesh.rotation.y = time * 2.2;
      pop.mesh.scale.setScalar(0.6 + t * 0.5);
      pop.mesh.material.opacity = 1 - t;
    }
  }

  private iconGeometry(type: BuffType): THREE.BufferGeometry {
    switch (type) {
      case 'immunity':
        return this.assets.geometry('pickup-shield', buildShieldGeometry);
      case 'life':
        return this.assets.geometry('pickup-heart', buildHeartGeometry);
      case 'speed':
        return this.assets.geometry('pickup-bolt', buildBoltGeometry);
    }
  }

  private ensurePickupView(pickup: Pickup): PickupView {
    const existing = this.pickupViews.get(pickup.id);
    if (existing) return existing;

    const root = new THREE.Group();
    const icon = new THREE.Mesh(
      this.iconGeometry(pickup.type),
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

    const view: PickupView = { root, icon, ring, type: pickup.type };
    this.pickupViews.set(pickup.id, view);
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

/** Thin extrude settings shared by every buff icon shape. */
const ICON_EXTRUDE: THREE.ExtrudeGeometryOptions = {
  depth: 0.16,
  bevelEnabled: true,
  bevelThickness: 0.03,
  bevelSize: 0.03,
  bevelSegments: 1,
};

function finalizeIcon(shape: THREE.Shape): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, ICON_EXTRUDE);
  geo.center();
  return geo;
}

/** A heater shield with a lightly peaked top and pointed base (immunity). */
function buildShieldGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.46);
  s.lineTo(0.34, 0.34);
  s.lineTo(0.34, -0.05);
  s.quadraticCurveTo(0.32, -0.34, 0, -0.5);
  s.quadraticCurveTo(-0.32, -0.34, -0.34, -0.05);
  s.lineTo(-0.34, 0.34);
  s.closePath();
  return finalizeIcon(s);
}

/** A rounded two-lobe heart with a bottom point (life). */
function buildHeartGeometry(): THREE.ExtrudeGeometry {
  const h = new THREE.Shape();
  h.moveTo(0, -0.42);
  h.bezierCurveTo(-0.16, -0.2, -0.5, -0.06, -0.5, 0.16);
  h.bezierCurveTo(-0.5, 0.42, -0.22, 0.5, 0, 0.28);
  h.bezierCurveTo(0.22, 0.5, 0.5, 0.42, 0.5, 0.16);
  h.bezierCurveTo(0.5, -0.06, 0.16, -0.2, 0, -0.42);
  return finalizeIcon(h);
}

/** A zig-zag lightning bolt (speed). */
function buildBoltGeometry(): THREE.ExtrudeGeometry {
  const b = new THREE.Shape();
  b.moveTo(0.1, 0.5);
  b.lineTo(-0.26, 0.06);
  b.lineTo(-0.04, 0.06);
  b.lineTo(-0.14, -0.5);
  b.lineTo(0.26, -0.02);
  b.lineTo(0.03, -0.02);
  b.closePath();
  return finalizeIcon(b);
}
