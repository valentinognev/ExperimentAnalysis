// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  cesiumSkinAction,
  destroyCesiumViewer,
  replaceCesiumImagery,
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

describe("cesiumSkinAction", () => {
  it("creates the viewer only on first mount", () => {
    expect(cesiumSkinAction(null, "night")).toBe("create");
    expect(cesiumSkinAction(undefined, "day")).toBe("create");
  });

  it("replaces imagery instead of recreating when only skin changes", () => {
    expect(cesiumSkinAction("night", "day")).toBe("replace-imagery");
    expect(cesiumSkinAction("day", "night")).toBe("replace-imagery");
  });

  it("is a noop when skin is unchanged", () => {
    expect(cesiumSkinAction("night", "night")).toBe("noop");
    expect(cesiumSkinAction("day", "day")).toBe("noop");
  });
});

describe("replaceCesiumImagery", () => {
  it("swaps the base layer without destroying the viewer", () => {
    const destroy = vi.fn();
    const removeAll = vi.fn();
    const addImageryProvider = vi.fn();
    const provider = { url: "https://example.test/{z}/{x}/{y}.png" };
    const viewer = {
      destroy,
      imageryLayers: { removeAll, addImageryProvider },
    };

    replaceCesiumImagery(viewer, provider);

    expect(removeAll).toHaveBeenCalledTimes(1);
    expect(addImageryProvider).toHaveBeenCalledWith(provider);
    expect(destroy).not.toHaveBeenCalled();
  });
});
