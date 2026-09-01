import { describe, it, expect } from "vitest";
import { DEFAULT_TAB, tabAfterAction, tabLabel } from "./workspaceTab";

describe("workspaceTab", () => {
  it("defaults to sources", () => {
    expect(DEFAULT_TAB).toBe("sources");
  });

  it("labels Sources, Analysis, and Replay", () => {
    expect(tabLabel("sources")).toBe("Sources");
    expect(tabLabel("analysis")).toBe("Analysis");
    expect(tabLabel("replay")).toBe("Replay");
  });

  it("never switches tabs on import, pull, or rebuild", () => {
    expect(tabAfterAction("import", "sources")).toBe("sources");
    expect(tabAfterAction("pull", "sources")).toBe("sources");
    expect(tabAfterAction("rebuild", "sources")).toBe("sources");
    expect(tabAfterAction("import", "analysis")).toBe("analysis");
    expect(tabAfterAction("import", "replay")).toBe("replay");
  });
});
