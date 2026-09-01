import { describe, it, expect } from "vitest";
import { paramDiffs } from "./paramDiffs";

it("diffs only changed", () => {
  expect(
    paramDiffs({ A: 1, B: 2 }, { A: 1, B: 3 }),
  ).toEqual({ B: 3 });
});
