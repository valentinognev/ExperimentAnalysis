// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  DEFAULT_GROUND_HALF_EXTENT_M,
  GROUND_PLANE_GRID_SIZE,
  groundPlaneExtent,
  groundPlaneTrace,
} from "./groundPlane";

describe("groundPlaneExtent", () => {
  it("defaults to ±200 m when no positions", () => {
    const ext = groundPlaneExtent([]);
    expect(ext).toEqual({
      eMin: -DEFAULT_GROUND_HALF_EXTENT_M,
      eMax: DEFAULT_GROUND_HALF_EXTENT_M,
      nMin: -DEFAULT_GROUND_HALF_EXTENT_M,
      nMax: DEFAULT_GROUND_HALF_EXTENT_M,
    });
  });

  it("pads bbox of positions", () => {
    const ext = groundPlaneExtent([
      { e: 10, n: 20, u: 5 },
      { e: 30, n: -5, u: 0 },
    ]);
    expect(ext.eMin).toBe(-10);
    expect(ext.eMax).toBe(50);
    expect(ext.nMin).toBe(-25);
    expect(ext.nMax).toBe(40);
  });
});

function allZValues(trace: ReturnType<typeof groundPlaneTrace>): number[] {
  if (trace.type === "surface") {
    return trace.z!.flat();
  }
  if (trace.type === "mesh3d") {
    return trace.z as number[];
  }
  return [];
}

describe("groundPlaneTrace", () => {
  it("returns dense pickable surface at z=0 with hoverinfo none", () => {
    const trace = groundPlaneTrace({
      eMin: -50,
      eMax: 50,
      nMin: -100,
      nMax: 100,
    });

    expect(trace.hoverinfo).toBe("none");
    expect(trace.hoverinfo).not.toBe("skip");

    if (trace.type === "surface") {
      expect(trace.x!.length).toBe(GROUND_PLANE_GRID_SIZE);
      expect(trace.y!.length).toBe(GROUND_PLANE_GRID_SIZE);
      expect(trace.z!.length).toBe(GROUND_PLANE_GRID_SIZE);
      expect(trace.z![0]!.length).toBe(GROUND_PLANE_GRID_SIZE);
    } else if (trace.type === "mesh3d") {
      expect(trace.x!.length).toBeGreaterThanOrEqual(16);
    } else {
      throw new Error(`unexpected trace type: ${trace.type}`);
    }

    const zValues = allZValues(trace);
    expect(zValues.length).toBeGreaterThanOrEqual(16);
    expect(zValues.every((z) => z === 0)).toBe(true);
  });
});
