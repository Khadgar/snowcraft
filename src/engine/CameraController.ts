import * as THREE from 'three';
import type { Arena } from '../game/types';

/** The visible ground region (gameplay coords), used by the minimap. */
export interface CameraView {
  x: number;
  y: number;
  halfX: number;
  halfY: number;
}

/**
 * Orthographic camera with a cartoon 3/4 tilt that gently follows the local hero
 * (design §4). The zoom is adjustable with the mouse wheel between the whole
 * arena (min) and a close follow view (max); the view scrolls with the target
 * and is clamped so it never shows beyond the arena edges.
 */
export class CameraController {
  readonly camera: THREE.OrthographicCamera;

  /** Elevation of the view above the horizon, in radians (lower = more oblique). */
  private readonly tilt = (52 * Math.PI) / 180;
  private readonly distance = 120;
  /** Visible ground width at MAX zoom, in world units (the close follow view). */
  private readonly maxZoomWidth = 25;
  /** Padding so the whole-arena (min-zoom) view leaves a small border. */
  private readonly fitMargin = 1.06;
  /** Per-frame smoothing factor for the follow (0..1; higher = snappier). */
  private readonly followLerp = 0.14;
  /** How much one wheel notch changes the zoom. */
  private readonly zoomStep = 0.12;

  /** 0 = min zoom (whole arena), 1 = max zoom (close follow). */
  private zoomT = 0;
  private aspect = 1;
  private arena: Arena | null = null;
  private halfW = 10;
  private halfH = 10;
  private readonly focus = new THREE.Vector3(0, 0, 0);
  private readonly desired = new THREE.Vector3(0, 0, 0);

  constructor() {
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
    this.applyPosition();
  }

  /** Sizes the frustum for the current zoom and recentres on the arena (design §4). */
  fit(arena: Arena, aspect: number): void {
    this.arena = arena;
    this.aspect = aspect;
    this.focus.set(0, 0, 0);
    this.desired.set(0, 0, 0);
    this.applyFrustum();
    this.applyPosition();
  }

  resize(aspect: number): void {
    this.aspect = aspect;
    if (this.arena) this.applyFrustum();
  }

  /** Adjusts zoom from a wheel event (scroll up = zoom in). */
  zoom(deltaY: number): void {
    const next = this.zoomT + (deltaY < 0 ? this.zoomStep : -this.zoomStep);
    this.zoomT = THREE.MathUtils.clamp(next, 0, 1);
    this.applyFrustum();
  }

  /**
   * Advances the follow camera one frame toward `target` (gameplay coords), or
   * eases back to the arena centre when there is no target. Clamped to the arena.
   */
  update(target: { x: number; y: number } | null): void {
    if (target) {
      this.desired.set(target.x, 0, target.y);
    } else {
      this.desired.set(0, 0, 0);
    }
    this.clampToArena(this.desired);

    this.focus.x += (this.desired.x - this.focus.x) * this.followLerp;
    this.focus.z += (this.desired.z - this.focus.z) * this.followLerp;
    this.applyPosition();
  }

  /** The visible ground rectangle in gameplay coords (for the minimap viewport). */
  getView(): CameraView {
    return {
      x: this.focus.x,
      y: this.focus.z,
      halfX: this.halfW,
      halfY: this.halfH / Math.sin(this.tilt),
    };
  }

  /** Positions the camera at a fixed offset above/behind the focus point. */
  private applyPosition(): void {
    const offY = Math.sin(this.tilt) * this.distance;
    const offZ = Math.cos(this.tilt) * this.distance;
    this.camera.position.set(this.focus.x, offY, this.focus.z + offZ);
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
  }

  private applyFrustum(): void {
    const arena = this.arena;
    if (!arena) return;
    const aspect = this.aspect;

    // Min zoom: the half-width that fits the whole arena for this aspect (depth
    // is foreshortened by the tilt). Max zoom: the close follow width.
    const fitHalfW = Math.max(
      arena.width / 2,
      (arena.height / 2) * Math.sin(this.tilt) * aspect,
    ) * this.fitMargin;
    const tightHalfW = Math.min(this.maxZoomWidth / 2, fitHalfW);

    const halfW = THREE.MathUtils.lerp(fitHalfW, tightHalfW, this.zoomT);
    const halfH = halfW / aspect;

    this.halfW = halfW;
    this.halfH = halfH;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  /** Keeps the visible ground rectangle inside the arena (mutates `point`). */
  private clampToArena(point: THREE.Vector3): void {
    const arena = this.arena;
    if (!arena) return;
    const halfViewX = this.halfW;
    const halfViewZ = this.halfH / Math.sin(this.tilt);
    const limitX = arena.width / 2 - halfViewX;
    const limitZ = arena.height / 2 - halfViewZ;
    point.x = limitX > 0 ? THREE.MathUtils.clamp(point.x, -limitX, limitX) : 0;
    point.z = limitZ > 0 ? THREE.MathUtils.clamp(point.z, -limitZ, limitZ) : 0;
  }
}
