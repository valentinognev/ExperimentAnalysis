// @vitest-environment node
import { describe, it, expect } from "vitest";
import { orderedDroneIds } from "./droneRows";

describe("orderedDroneIds", () => {
  it("lists each physical slot then its replays by j", () => {
    expect(orderedDroneIds([1, 2, "2_r2", "2_r1", 3, 4], 4)).toEqual([
      "1",
      "2",
      "2_r1",
      "2_r2",
      "3",
      "4",
    ]);
  });

  it("omits replays whose parent exceeds physicalCount", () => {
    expect(orderedDroneIds([1, 2, "3_r1", "2_r1"], 2)).toEqual(["1", "2", "2_r1"]);
  });
});
