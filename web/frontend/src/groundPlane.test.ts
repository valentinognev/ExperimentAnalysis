// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  DEFAULT_GROUND_HALF_EXTENT_M,
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

describe("groundPlaneTrace", () => {
  it("returns mesh3d with all z at 0", () => {
    const trace = groundPlaneTrace({
      eMin: -50,
      eMax: 50,
      nMin: -100,
      nMax: 100,
    });
    expect(trace.type === "mesh3d" || trace.type === "surface").toBe(true);
    if (trace.type === "mesh3d") {
      expect(trace.z).toEqual([0, 0, 0, 0]);
    } else {
      expect(trace.z).toEqual([
        [0, 0],
        [0, 0],
      ]);
    }
  });
});
