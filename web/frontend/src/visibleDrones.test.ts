// @vitest-environment node
import { describe, it, expect } from "vitest";
import { filterVisible } from "./visibleDrones";

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
