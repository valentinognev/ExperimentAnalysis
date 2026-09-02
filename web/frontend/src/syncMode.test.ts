import { describe, it, expect } from "vitest";
import {
  parseSyncMode,
  physicalSyncIds,
  rebaseOffsets,
  parseOffsetInput,
} from "./syncMode";

describe("parseSyncMode", () => {
  it("defaults to arm", () => {
    expect(parseSyncMode(undefined)).toBe("arm");
    expect(parseSyncMode("nope")).toBe("arm");
    expect(parseSyncMode("manual")).toBe("manual");
  });
});

describe("physicalSyncIds", () => {
  it("drops replay children", () => {
    expect(physicalSyncIds(["2", "2_r1", "3"])).toEqual(["2", "3"]);
  });
});

describe("rebaseOffsets", () => {
  it("zeros the new main and subtracts its old offset", () => {
    expect(rebaseOffsets({ "2": 0, "3": 1.5, "4": -0.5 }, "3")).toEqual({
      "2": -1.5,
      "3": 0,
      "4": -2.0,
    });
  });
});

describe("parseOffsetInput", () => {
  it("parses seconds or rejects junk", () => {
    expect(parseOffsetInput("1.5")).toBe(1.5);
    expect(parseOffsetInput("-0.25")).toBe(-0.25);
    expect(parseOffsetInput("")).toBeNull();
    expect(parseOffsetInput("x")).toBeNull();
  });
});
