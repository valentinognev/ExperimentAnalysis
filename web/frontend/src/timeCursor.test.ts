// @vitest-environment node
import { describe, it, expect } from "vitest";
import { advance } from "./timeCursor";

describe("advance", () => {
  const tMax = 100;

  it("forward from 0 with positive dt increases t", () => {
    expect(advance(0, 1, 1, 1, tMax)).toBe(1);
  });

  it("reverse play decreases t", () => {
    expect(advance(10, 1, -1, 1, tMax)).toBe(9);
  });

  it("direction 0 (pause) leaves t unchanged", () => {
    expect(advance(42, 1, 0, 2, tMax)).toBe(42);
  });

  it("speed 2 doubles the step vs speed 1", () => {
    const step1 = advance(0, 1, 1, 1, tMax);
    const step2 = advance(0, 1, 1, 2, tMax);
    expect(step2).toBe(step1 * 2);
  });

  it("clamps below 0", () => {
    expect(advance(0.5, 1, -1, 1, tMax)).toBe(0);
  });

  it("clamps above tMax", () => {
    expect(advance(99, 2, 1, 1, tMax)).toBe(tMax);
  });
});
