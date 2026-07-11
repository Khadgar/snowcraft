import * as THREE from 'three';

/**
 * Central asset manager (design §22). For the procedural art direction it acts
 * as a cache/factory for shared Three.js materials and geometries so meshes can
 * be instanced without duplicate GPU resources. The async `loadAll` hook is a
 * seam for dropping in real models/textures/audio later without touching call
 * sites.
 */
export class AssetManager {
  private readonly materials = new Map<string, THREE.Material>();
  private readonly geometries = new Map<string, THREE.BufferGeometry>();

  /** Async loading hook. No-op for procedural assets; resolves immediately. */
  async loadAll(): Promise<void> {
    return Promise.resolve();
  }

  /** Returns a cached material, creating it via `factory` on first use. */
  material<T extends THREE.Material>(key: string, factory: () => T): T {
    let mat = this.materials.get(key);
    if (!mat) {
      mat = factory();
      this.materials.set(key, mat);
    }
    return mat as T;
  }

  /** Returns a cached geometry, creating it via `factory` on first use. */
  geometry<T extends THREE.BufferGeometry>(key: string, factory: () => T): T {
    let geo = this.geometries.get(key);
    if (!geo) {
      geo = factory();
      this.geometries.set(key, geo);
    }
    return geo as T;
  }

  /** Shared flat-shaded standard material keyed by color (cartoon palette). */
  standardMaterial(color: number, flatShading = true): THREE.MeshStandardMaterial {
    return this.material(`standard:${color}:${flatShading ? 1 : 0}`, () =>
      new THREE.MeshStandardMaterial({ color, flatShading, roughness: 0.85, metalness: 0 }),
    );
  }

  dispose(): void {
    for (const mat of this.materials.values()) mat.dispose();
    for (const geo of this.geometries.values()) geo.dispose();
    this.materials.clear();
    this.geometries.clear();
  }
}
