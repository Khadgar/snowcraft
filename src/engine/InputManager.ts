import * as THREE from 'three';
import type { Command } from '../core/commands';

interface Point {
  x: number;
  y: number;
}

/**
 * Translates raw mouse/keyboard input into high-level {@link Command}s
 * (design §23). Gameplay systems drain the command queue and never read the
 * DOM directly.
 *
 * Left-button disambiguation (design §11) is target-aware so aiming can never be
 * cancelled or lose the selection once it starts:
 *  - Press ON one of your units (or with Shift, or with nothing selected): a
 *    selection gesture — a tap selects/switches, a drag beyond a threshold is a
 *    box selection.
 *  - Press anywhere else while a unit is selected: AIMING — movement adjusts the
 *    throw direction and release always throws (even a quick flick).
 * Right button issues a move order. Escape/P toggles pause.
 */
export class InputManager {
  private readonly queue: Command[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly ndc = new THREE.Vector2();
  private readonly hit = new THREE.Vector3();

  private readonly dragThresholdPx = 6;

  private leftDown = false;
  private classification: 'none' | 'aim' | 'select' | 'box' = 'none';
  private shiftAtDown = false;
  private readonly heldMoveKeys = new Set<string>();
  private startClient: Point = { x: 0, y: 0 };
  private currentClient: Point = { x: 0, y: 0 };
  private startGround: Point | null = null;
  private currentGround: Point | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    /**
     * Reports whether the player currently has a friendly unit selected. Used to
     * make a left hold-drag mean "aim" (never cancels) when something is
     * selected, versus "box-select" when nothing is.
     */
    private readonly hasSelection: () => boolean = () => false,
    /**
     * Reports whether a friendly, selectable unit sits at the given ground
     * point. Lets a quick tap while aiming switch units without ever
     * deselecting on empty ground / obstacles / enemies.
     */
    private readonly unitAt: (x: number, y: number) => boolean = () => false,
    /**
     * Reports whether the match is actively playing (not on a menu or paused).
     * Keyboard steering/selection only act during play so menus keep normal
     * keyboard behavior.
     */
    private readonly isPlaying: () => boolean = () => true,
  ) {
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  /** Returns queued commands and clears the queue (called in the Input phase). */
  consume(): Command[] {
    if (this.queue.length === 0) return [];
    return this.queue.splice(0, this.queue.length);
  }

  /** Screen-space drag rectangle for the selection overlay, or null. */
  getScreenDragRect(): { x: number; y: number; w: number; h: number } | null {
    if (this.classification !== 'box') return null;
    const x = Math.min(this.startClient.x, this.currentClient.x);
    const y = Math.min(this.startClient.y, this.currentClient.y);
    const w = Math.abs(this.currentClient.x - this.startClient.x);
    const h = Math.abs(this.currentClient.y - this.startClient.y);
    return { x, y, w, h };
  }

  private screenToGround(clientX: number, clientY: number): Point | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const point = this.raycaster.ray.intersectPlane(this.groundPlane, this.hit);
    if (!point) return null;
    return { x: point.x, y: point.z };
  }

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2) {
      const g = this.screenToGround(e.clientX, e.clientY);
      if (g) this.queue.push({ type: 'MoveUnits', x: g.x, y: g.y });
      return;
    }
    if (e.button !== 0) return;
    this.leftDown = true;
    this.shiftAtDown = e.shiftKey;
    this.startClient = { x: e.clientX, y: e.clientY };
    this.currentClient = { ...this.startClient };
    this.startGround = this.screenToGround(e.clientX, e.clientY);
    this.currentGround = this.startGround;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can throw for synthetic/invalid pointers; ignore.
    }

    // Pressing on one of your own units selects it; pressing elsewhere while a
    // unit is selected aims. Shift always means selection (additive/box). Aiming,
    // once started, sticks for the whole press and can only end in a throw.
    const onUnit = this.startGround ? this.unitAt(this.startGround.x, this.startGround.y) : false;
    const aiming = this.hasSelection() && !e.shiftKey && !onUnit;
    if (aiming) {
      this.classification = 'aim';
      if (this.startGround) {
        this.queue.push({ type: 'ChargeStart', x: this.startGround.x, y: this.startGround.y });
      }
    } else {
      this.classification = 'select';
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.currentClient = { x: e.clientX, y: e.clientY };
    const g = this.screenToGround(e.clientX, e.clientY);
    if (g) this.currentGround = g;
    if (!this.leftDown) return;

    // Aiming is sticky: any movement only re-aims and never cancels the charge.
    if (this.classification === 'aim') {
      if (g) this.queue.push({ type: 'ChargeAim', x: g.x, y: g.y });
      return;
    }

    // A selection gesture becomes a box-select once the pointer drags far enough.
    if (this.classification === 'select') {
      const distPx = Math.hypot(
        this.currentClient.x - this.startClient.x,
        this.currentClient.y - this.startClient.y,
      );
      if (distPx > this.dragThresholdPx) {
        this.classification = 'box';
      }
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.leftDown) return;
    this.leftDown = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // pointer capture may already be released
    }
    const additive = this.shiftAtDown || e.shiftKey;
    const g = this.currentGround ?? this.startGround;

    if (this.classification === 'box') {
      if (this.startGround && this.currentGround) {
        this.queue.push({
          type: 'BoxSelect',
          minX: Math.min(this.startGround.x, this.currentGround.x),
          minY: Math.min(this.startGround.y, this.currentGround.y),
          maxX: Math.max(this.startGround.x, this.currentGround.x),
          maxY: Math.max(this.startGround.y, this.currentGround.y),
          additive,
        });
      }
    } else if (this.classification === 'aim') {
      // Aiming never cancels or deselects: any release throws along the current
      // (smoothed) facing. A weak flick is still a throw, not a cancel.
      if (g) {
        this.queue.push({ type: 'ChargeRelease', x: g.x, y: g.y });
      } else {
        this.queue.push({ type: 'ChargeCancel' });
      }
    } else if (g) {
      // A selection gesture that never dragged: select/clear at the point.
      this.queue.push({ type: 'SelectAt', x: g.x, y: g.y, additive });
    }
    this.classification = 'none';
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      this.queue.push({ type: 'TogglePause' });
      return;
    }
    if (!this.isPlaying()) return;

    const key = e.key.toLowerCase();
    if (key === 'tab') {
      e.preventDefault();
      this.queue.push({ type: 'CycleSelection' });
      return;
    }
    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
      if (!this.heldMoveKeys.has(key)) {
        this.heldMoveKeys.add(key);
        this.emitMoveAxis();
      }
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (this.heldMoveKeys.delete(e.key.toLowerCase())) {
      this.emitMoveAxis();
    }
  };

  /**
   * Emits the current WASD steering direction in gameplay space (W is "up" the
   * board = −y, given the fixed camera), normalized so diagonals aren't faster.
   */
  private emitMoveAxis(): void {
    const x = (this.heldMoveKeys.has('d') ? 1 : 0) - (this.heldMoveKeys.has('a') ? 1 : 0);
    const y = (this.heldMoveKeys.has('s') ? 1 : 0) - (this.heldMoveKeys.has('w') ? 1 : 0);
    const length = Math.hypot(x, y);
    if (length > 0) {
      this.queue.push({ type: 'MoveAxis', x: x / length, y: y / length });
    } else {
      this.queue.push({ type: 'MoveAxis', x: 0, y: 0 });
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
