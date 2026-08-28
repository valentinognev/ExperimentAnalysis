import { describe, it, expect } from "vitest";
import { transferProgressLabel, type TransferProgress } from "./transferProgress";

describe("transferProgressLabel", () => {
  it("shows name, percent, and file index", () => {
    const p: TransferProgress = {
      name: "a.csv",
      index: 1,
      count: 2,
      bytes: 500,
      total: 1000,
      pct: 50,
    };
    expect(transferProgressLabel(p)).toBe("a.csv  50%  (1/2)");
  });
});
