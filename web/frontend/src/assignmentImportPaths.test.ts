import { describe, it, expect } from "vitest";
import { assignmentImportPaths } from "./components/ExperimentBar";

describe("assignmentImportPaths", () => {
  it("joins needs_id basenames under a directory path", () => {
    expect(
      assignmentImportPaths("/data/sitl", ["mystery.ulg", "other.ulg"]),
    ).toEqual(["/data/sitl/mystery.ulg", "/data/sitl/other.ulg"]);
  });

  it("returns the single file path when import was a file", () => {
    expect(
      assignmentImportPaths("/data/sitl/mystery.ulg", ["mystery.ulg"]),
    ).toEqual(["/data/sitl/mystery.ulg"]);
  });
});
