// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  isReplayId,
  nextReplayIndex,
  parentId,
  physicalId,
  replayId,
  replayIndex,
} from "./replayId";

describe("replayId", () => {
  it("parses Di_rj replay ids", () => {
    expect(isReplayId("2_r1")).toBe(true);
    expect(isReplayId(2)).toBe(false);
    expect(isReplayId("2")).toBe(false);
    expect(parentId("2_r1")).toBe(2);
    expect(replayIndex("2_r1")).toBe(1);
    expect(replayId(2, 3)).toBe("2_r3");
  });

  it("maps physical ids and replay parents", () => {
    expect(physicalId(2)).toBe(2);
    expect(physicalId("4")).toBe(4);
    expect(physicalId("2_r1")).toBe(2);
    expect(physicalId("x")).toBeNull();
  });

  it("next index is monotonic and does not reuse", () => {
    expect(nextReplayIndex([2, 3, "2_r1", "2_r2", "3_r1"], 2)).toBe(3);
    expect(nextReplayIndex(["2_r1", "2_r3"], 2)).toBe(4);
    expect(nextReplayIndex([2], 2)).toBe(1);
  });

  it("throws parentId and replayIndex on a non-replay id", () => {
    expect(() => parentId(2)).toThrow();
    expect(() => parentId("2")).toThrow();
    expect(() => replayIndex("x")).toThrow();
    expect(() => replayIndex(2)).toThrow();
  });
});
