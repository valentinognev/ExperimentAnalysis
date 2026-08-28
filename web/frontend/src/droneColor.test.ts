// @vitest-environment node
import { describe, it, expect } from "vitest";
import { DRONE_COLORS, droneColor } from "./droneColor";

/** Observation Board `web/frontend/src/utils/droneColors.ts` */
const OB_COLORS = [
  "#FF2D00",
  "#008CFF",
  "#00D615",
  "#FFD200",
  "#BE00FF",
  "#FF00D9",
  "#00E0E0",
  "#FF8800",
  "#8FDF00",
];

describe("droneColor", () => {
  it("matches Observation Board palette by physical id", () => {
    expect(DRONE_COLORS).toEqual(OB_COLORS);
    expect(droneColor(1)).toBe("#FF2D00");
    expect(droneColor("2")).toBe("#008CFF");
    expect(droneColor(3)).toBe("#00D615");
    expect(droneColor("4")).toBe("#FFD200");
  });

  it("wraps after nine ids and ignores list index", () => {
    expect(droneColor(5)).toBe("#BE00FF");
    expect(droneColor("10")).toBe("#FF2D00");
  });

  it("falls back to the first swatch for invalid ids", () => {
    expect(droneColor(0)).toBe("#FF2D00");
    expect(droneColor("x")).toBe("#FF2D00");
  });
});
