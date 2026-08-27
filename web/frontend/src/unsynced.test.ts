// @vitest-environment node
import { describe, it, expect } from "vitest";
import { bannerText } from "./unsynced";

describe("bannerText", () => {
  it("lists unsynced drone ids only", () => {
    const text = bannerText({
      "2": { synced: false },
      "3": { synced: true },
    });
    expect(text).toContain("2");
    expect(text).not.toContain("3");
  });

  it("returns empty when all drones are synced", () => {
    expect(
      bannerText({
        "2": { synced: true },
        "3": { synced: true },
      }),
    ).toBe("");
  });

  it("returns empty when there are no drones", () => {
    expect(bannerText({})).toBe("");
  });
});
