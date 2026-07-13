import { describe, expect, it } from 'vitest';
import { createEmptyArena } from '../game/Arena';
import { CameraController } from './CameraController';

const ASPECT = 1280 / 800;

/** Zoom in a lot so the target clamps to max zoom, giving a clear travel range. */
function zoomInHard(controller: CameraController): void {
  for (let i = 0; i < 20; i++) controller.zoom(-100);
}

describe('CameraController zoom smoothing', () => {
  it('does not change the view on the wheel event alone (no instant snap)', () => {
    const controller = new CameraController();
    controller.fit(createEmptyArena(), ASPECT);

    const before = controller.getView().halfX;
    zoomInHard(controller);

    expect(controller.getView().halfX).toBe(before);
  });

  it('eases toward the target over several frames rather than jumping', () => {
    const controller = new CameraController();
    controller.fit(createEmptyArena(), ASPECT);

    const start = controller.getView().halfX;
    zoomInHard(controller);

    controller.update(null);
    const afterOne = controller.getView().halfX;

    // Moved after one frame, but only part of the way.
    expect(afterOne).toBeLessThan(start);

    for (let i = 0; i < 500; i++) controller.update(null);
    const settled = controller.getView().halfX;

    // The first frame did not reach the final zoom (it was gradual)...
    expect(afterOne).toBeGreaterThan(settled);
    // ...and zooming in shrinks the visible width overall.
    expect(settled).toBeLessThan(start);
  });

  it('settles exactly at the target and then stops moving', () => {
    const controller = new CameraController();
    controller.fit(createEmptyArena(), ASPECT);

    zoomInHard(controller);
    for (let i = 0; i < 500; i++) controller.update(null);

    const settled = controller.getView().halfX;
    controller.update(null);
    controller.update(null);

    expect(controller.getView().halfX).toBe(settled);
  });
});
