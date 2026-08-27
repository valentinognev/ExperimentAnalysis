// @vitest-environment node
import { describe, it, expect } from "vitest";
import { filterVisible, mergeDroneIds } from "./visibleDrones";

describe("filterVisible", () => {
  it("keeps ids that are in the visible set", () => {
    expect(filterVisible(["2", "3", "4"], ["2", "4"])).toEqual(["2", "4"]);
  });

  it("returns none when visible is empty", () => {
    expect(filterVisible(["2", "3", "4"], [])).toEqual([]);
    expect(filterVisible(["2", "3", "4"], new Set())).toEqual([]);
  });

  it("accepts Set for visible", () => {
    expect(filterVisible(["2", "3"], new Set(["3"]))).toEqual(["3"]);
  });
});

describe("mergeDroneIds", () => {
  it("keeps listed order first then appends pose-only ids", () => {
    expect(mergeDroneIds(["2", "3"], ["3", "4"])).toEqual(["2", "3", "4"]);
  });

  it("deduplicates across listed and pose", () => {
    expect(mergeDroneIds(["1", "2"], ["2", "1"])).toEqual(["1", "2"]);
  });

  it("returns pose ids when listed is empty", () => {
    expect(mergeDroneIds([], ["4", "2"])).toEqual(["4", "2"]);
  });

  it("returns listed when pose is empty", () => {
    expect(mergeDroneIds(["2", "3"], [])).toEqual(["2", "3"]);
  });
});
