// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  destroyCesiumViewer,
  unbindCesiumPointerEvents,
} from "./cesiumViewer";

function viewerThatThrowsOnSceneAfterDestroy() {
  const canvas = {
    removeEventListener: vi.fn(),
  };
  const viewer = {
    destroyed: false,
    useDefaultRenderLoop: true,
    isDestroyed() {
      return this.destroyed;
    },
    destroy() {
      this.destroyed = true;
    },
    get scene(): { canvas: { removeEventListener: ReturnType<typeof vi.fn> } } {
      if (this.destroyed) {
        throw new TypeError("Cannot read properties of undefined (reading 'scene')");
      }
      return { canvas };
    },
  };
  return viewer;
}

describe("unbindCesiumPointerEvents", () => {
  it("does not read viewer.scene after destroy (Cesium→Plotly unmount)", () => {
    const viewer = viewerThatThrowsOnSceneAfterDestroy();
    const handler = { removeInputAction: vi.fn() };
    destroyCesiumViewer(viewer);

    expect(() =>
      unbindCesiumPointerEvents(viewer, handler, 1, 2, vi.fn()),
    ).not.toThrow();
    expect(handler.removeInputAction).not.toHaveBeenCalled();
  });

  it("removes handlers while the viewer is still alive", () => {
    const viewer = viewerThatThrowsOnSceneAfterDestroy();
    const handler = { removeInputAction: vi.fn() };
    const preventMenu = vi.fn();

    unbindCesiumPointerEvents(viewer, handler, "left", "right", preventMenu);

    expect(handler.removeInputAction).toHaveBeenCalledWith("left");
    expect(handler.removeInputAction).toHaveBeenCalledWith("right");
  });
});
