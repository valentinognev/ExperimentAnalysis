import { describe, it, expect } from "vitest";
import { sliceTrail, type TrailSeries } from "./trail";

const series: TrailSeries = {
  t: [0, 1, 2, 3],
  e: [0, 10, 20, 30],
  n: [0, 1, 2, 3],
  u: [0, 0, 0, 0],
};

describe("sliceTrail", () => {
  it("keeps samples at or before T", () => {
    const pts = sliceTrail(series, 2);
    expect(pts.map((p) => p.e)).toEqual([0, 10, 20]);
  });

  it("drops future samples when T moves backward", () => {
    const pts = sliceTrail(series, 1);
    expect(pts.map((p) => p.e)).toEqual([0, 10]);
    expect(pts.at(-1)?.e).toBe(10);
  });

  it("interpolates the last point at T between samples", () => {
    const pts = sliceTrail(series, 1.5);
    expect(pts.at(-1)).toEqual({ e: 15, n: 1.5, u: 0 });
  });

  it("returns empty when T is before the first sample", () => {
    expect(sliceTrail(series, -1)).toEqual([]);
  });
});
