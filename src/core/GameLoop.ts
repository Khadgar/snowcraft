/**
 * Fixed-timestep game loop (design §25). The simulation advances in fixed
 * increments at a constant rate (60 Hz) while rendering runs every animation
 * frame with an interpolation factor. This decouples simulation determinism
 * from display refresh rate.
 */
export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  /** Smoothed frames-per-second estimate for debug/HUD (design §21, §27). */
  fps = 0;
  /** Last render frame time in milliseconds. */
  frameTimeMs = 0;

  constructor(
    private readonly fixedDt: number,
    private readonly maxSteps: number,
    private readonly onFixedUpdate: (dt: number) => void,
    private readonly onRender: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    let frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.frameTimeMs = frameTime * 1000;
    this.fps += ((1 / Math.max(frameTime, 1e-6)) - this.fps) * 0.1;

    // Clamp to avoid a spiral of death after a stall (e.g., tab switch).
    if (frameTime > 0.25) frameTime = 0.25;
    this.accumulator += frameTime;

    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxSteps) {
      this.onFixedUpdate(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (steps === this.maxSteps && this.accumulator > this.fixedDt) {
      this.accumulator = 0; // drop backlog we could not process in time
    }

    const alpha = this.accumulator / this.fixedDt;
    this.onRender(alpha);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
