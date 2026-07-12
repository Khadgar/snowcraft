import * as THREE from 'three';
import type { AssetManager } from '../engine/AssetManager';
import { toThree } from './coords';
import type { Arena, Obstacle } from '../game/types';

/**
 * Builds procedural arena visuals from arena data (design §8): a snow ground
 * plane plus meshes for each obstacle, assembled from Three.js primitives with
 * a cartoon palette. Static — meshes are created once and never per-frame.
 */
export class ArenaRenderer {
  private readonly group = new THREE.Group();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: AssetManager,
    arena: Arena,
  ) {
    this.buildGround(arena);
    for (const obstacle of arena.obstacles) {
      const mesh = this.buildObstacle(obstacle);
      if (mesh) this.group.add(mesh);
    }
    scene.add(this.group);
  }

  private buildGround(arena: Arena): void {
    const geo = new THREE.PlaneGeometry(arena.width, arena.height);
    geo.rotateX(-Math.PI / 2);
    const mat = this.assets.standardMaterial(0xf9fcff, false);
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.group.add(ground);

    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x9fc0e0 }),
    );
    this.group.add(border);
  }

  private buildObstacle(obstacle: Obstacle): THREE.Object3D | null {
    switch (obstacle.type) {
      case 'tree':
        return this.buildTree(obstacle);
      case 'rock':
        return this.buildRock(obstacle);
      case 'fort':
        return this.buildFort(obstacle);
      case 'fence':
        return this.buildFence(obstacle);
      case 'prop':
        return this.buildProp(obstacle);
    }
  }

  private radiusOf(obstacle: Obstacle, fallback: number): number {
    return obstacle.collision.kind === 'circle' ? obstacle.collision.radius : fallback;
  }

  private buildTree(o: Obstacle): THREE.Object3D {
    const group = new THREE.Group();
    const r = this.radiusOf(o, 0.35);
    const trunk = new THREE.Mesh(
      this.assets.geometry('tree-trunk', () => new THREE.CylinderGeometry(0.12, 0.16, 1, 6)),
      this.assets.standardMaterial(0x6b4a2b),
    );
    trunk.position.y = 0.5;
    trunk.castShadow = true;
    group.add(trunk);

    const foliageMat = this.assets.standardMaterial(0x2f7d4f);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(
        this.assets.geometry('tree-foliage', () => new THREE.ConeGeometry(1, 1.1, 7)),
        foliageMat,
      );
      const scale = (1 - i * 0.22) * (r / 0.35);
      cone.scale.setScalar(scale);
      cone.position.y = 1.1 + i * 0.55;
      cone.castShadow = true;
      group.add(cone);
    }
    this.place(group, o);
    return group;
  }

  private buildRock(o: Obstacle): THREE.Object3D {
    const r = this.radiusOf(o, 0.6);
    const rock = new THREE.Mesh(
      this.assets.geometry('rock', () => new THREE.IcosahedronGeometry(1, 0)),
      this.assets.standardMaterial(0x9aa3ad),
    );
    rock.scale.set(r, r * 0.8, r);
    rock.rotation.set(0.3, 0.7, 0.2);
    rock.position.y = r * 0.5;
    rock.castShadow = true;
    rock.receiveShadow = true;
    this.place(rock, o);
    return rock;
  }

  private buildFort(o: Obstacle): THREE.Object3D {
    const halfW = o.collision.kind === 'rect' ? o.collision.halfW : 1;
    const halfH = o.collision.kind === 'rect' ? o.collision.halfH : 1;
    const height = 1.1;
    const fort = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 2, height, halfH * 2),
      this.assets.standardMaterial(0xe8f2ff),
    );
    fort.position.y = height / 2;
    fort.castShadow = true;
    fort.receiveShadow = true;
    this.place(fort, o);
    return fort;
  }

  private buildFence(o: Obstacle): THREE.Object3D {
    const halfW = o.collision.kind === 'rect' ? o.collision.halfW : 1;
    const halfH = o.collision.kind === 'rect' ? o.collision.halfH : 0.12;
    const height = 0.7;
    const fence = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 2, height, halfH * 2),
      this.assets.standardMaterial(0x8a5a34),
    );
    fence.position.y = height / 2;
    fence.castShadow = true;
    this.place(fence, o);
    return fence;
  }

  private buildProp(o: Obstacle): THREE.Object3D {
    // A little snowman for decoration.
    const group = new THREE.Group();
    const mat = this.assets.standardMaterial(0xffffff, false);
    const base = new THREE.Mesh(
      this.assets.geometry('sphere', () => new THREE.SphereGeometry(1, 12, 12)),
      mat,
    );
    base.scale.setScalar(0.35);
    base.position.y = 0.35;
    base.castShadow = true;
    group.add(base);
    const head = new THREE.Mesh(base.geometry, mat);
    head.scale.setScalar(0.24);
    head.position.y = 0.78;
    head.castShadow = true;
    group.add(head);
    this.place(group, o);
    return group;
  }

  private place(obj: THREE.Object3D, o: Obstacle): void {
    toThree(this.tmp, o.position.x, o.position.y, 0);
    obj.position.x += this.tmp.x;
    obj.position.z += this.tmp.z;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
  }
}
