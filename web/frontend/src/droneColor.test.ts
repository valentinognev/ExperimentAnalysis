// @vitest-environment node
import { describe, it, expect } from "vitest";
import { DRONE_COLORS, droneColor } from "./droneColor";

describe("droneColor", () => {
  it("maps D1..D4 to the analysis palette by physical id", () => {
    expect(DRONE_COLORS).toEqual(["#f97316", "#22d3ee", "#a78bfa", "#f472b6"]);
    expect(droneColor(1)).toBe("#f97316");
    expect(droneColor("2")).toBe("#22d3ee");
    expect(droneColor(3)).toBe("#a78bfa");
    expect(droneColor("4")).toBe("#f472b6");
  });

  it("wraps after four ids and ignores list index", () => {
    expect(droneColor(5)).toBe("#f97316");
    expect(droneColor("6")).toBe("#22d3ee");
  });

  it("falls back to the first swatch for invalid ids", () => {
    expect(droneColor(0)).toBe("#f97316");
    expect(droneColor("x")).toBe("#f97316");
  });
});
