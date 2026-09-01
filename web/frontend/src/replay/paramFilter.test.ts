import { describe, it, expect } from "vitest";
import { DEFAULT_PARAM_FILTER, filterParams } from "./paramFilter";

it("defaults to EKF2", () => {
  expect(DEFAULT_PARAM_FILTER).toBe("EKF2");
});

it("filters by substring", () => {
  const params = [
    { name: "EKF2_RNG_NOISE", value: 0.1 },
    { name: "MC_ROLL_P", value: 6 },
  ];
  expect(filterParams(params, "EKF2").map((p) => p.name)).toEqual(["EKF2_RNG_NOISE"]);
  expect(filterParams(params, "").map((p) => p.name)).toEqual(["EKF2_RNG_NOISE", "MC_ROLL_P"]);
});
