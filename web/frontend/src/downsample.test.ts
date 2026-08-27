// @vitest-environment node
import { describe, it, expect } from "vitest";
import { downsampleHz } from "./downsample";

function keptCount(ts: number[], maxHz = 20): number {
  return downsampleHz(ts, maxHz).filter(Boolean).length;
}

describe("downsampleHz", () => {
  it("dense 1ms samples: capped at ~20 Hz and keeps first and last", () => {
    const ts = Array.from({ length: 100 }, (_, i) => i * 0.001);
    const keep = downsampleHz(ts, 20);
    const kept = keep.filter(Boolean).length;

    expect(kept).toBeLessThanOrEqual(0.1 * 20 + 2);
    expect(kept).toBeGreaterThanOrEqual(2);
    expect(keep[0]).toBe(true);
    expect(keep[keep.length - 1]).toBe(true);
  });

  it("sparse 50ms samples at ≤20 Hz: keep all", () => {
    const ts = Array.from({ length: 5 }, (_, i) => i * 0.05);
    const keep = downsampleHz(ts, 20);

    expect(keep.every(Boolean)).toBe(true);
    expect(keptCount(ts)).toBe(ts.length);
  });
});
