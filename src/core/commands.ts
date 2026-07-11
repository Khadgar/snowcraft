/**
 * High-level input commands produced by the InputManager and consumed by
 * gameplay systems (design §23). Gameplay never reads the raw mouse/keyboard.
 *
 * Control scheme (mouse only, design §11):
 *  - Left click on a unit selects it; Shift adds to the selection.
 *  - Left press + drag on open ground draws a selection rectangle (BoxSelect).
 *  - Left press + hold (mostly in place) on open ground with a selection
 *    charges a throw aimed at the cursor; releasing throws.
 *  - Right click issues a move order to the selection.
 *  - WASD nudges the selection (keyboard steering); Tab cycles the selection.
 */
export type Command =
  | { type: 'SelectAt'; x: number; y: number; additive: boolean }
  | { type: 'BoxSelect'; minX: number; minY: number; maxX: number; maxY: number; additive: boolean }
  | { type: 'ClearSelection' }
  | { type: 'MoveUnits'; x: number; y: number }
  | { type: 'MoveAxis'; x: number; y: number }
  | { type: 'CycleSelection' }
  | { type: 'ChargeStart'; x: number; y: number }
  | { type: 'ChargeAim'; x: number; y: number }
  | { type: 'ChargeRelease'; x: number; y: number }
  | { type: 'ChargeCancel' }
  | { type: 'TogglePause' };

export type CommandType = Command['type'];
