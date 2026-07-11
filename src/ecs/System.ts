/**
 * A system advances one slice of the simulation by a fixed timestep
 * (design §25). Systems receive their world and dependencies via constructor
 * injection (design §29) and never reach into rendering.
 */
export interface System {
  readonly name: string;
  /** Advance the system by `dt` seconds (fixed simulation step). */
  update(dt: number): void;
}
