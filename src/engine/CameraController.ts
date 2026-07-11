import * as THREE from 'three';
import type { Arena } from '../game/types';

/**
 * Fixed orthographic camera with a slight downward angle, echoing the Flash
 * original (design §4). No rotation, no zoom; the arena always fits on screen.
 */
export class CameraController {
  readonly camera: THREE.OrthographicCamera;

  /** Elevation of the view above the horizon, in radians. */
  private readonly tilt = (62 * Math.PI) / 180;
  private readonly distance = 120;
  private readonly margin = 1.12;
  private arena: Arena | null = null;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
    this.camera.position.set(
      0,
      Math.sin(this.tilt) * this.distance,
      Math.cos(this.tilt) * this.distance,
    );
    this.camera.lookAt(0, 0, 0);
  }

  /** Sizes the frustum so the whole arena fits comfortably (design §4). */
  fit(arena: Arena, aspect: number): void {
    this.arena = arena;
    this.applyFrustum(aspect);
  }

  resize(aspect: number): void {
    if (this.arena) this.applyFrustum(aspect);
  }

  private applyFrustum(aspect: number): void {
    const arena = this.arena;
    if (!arena) return;
    // Depth (gameplay y / world z) is foreshortened by the view tilt.
    let halfW = (arena.width / 2) * this.margin;
    let halfH = ((arena.height / 2) * Math.sin(this.tilt)) * this.margin;
    if (halfW / halfH < aspect) {
      halfW = halfH * aspect;
    } else {
      halfH = halfW / aspect;
    }
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }
}
