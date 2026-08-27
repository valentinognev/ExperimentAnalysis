// @vitest-environment node
import { describe, it, expect } from "vitest";
import { shouldLoadCesium } from "./engineToggle";

describe("shouldLoadCesium", () => {
  it("returns true for cesium", () => {
    expect(shouldLoadCesium("cesium")).toBe(true);
  });

  it("returns false for plotly", () => {
    expect(shouldLoadCesium("plotly")).toBe(false);
  });
});
