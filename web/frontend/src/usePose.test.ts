// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PoseResponse } from "./api";

vi.mock("./api", () => ({
  getPose: vi.fn(),
}));

import { getPose } from "./api";
import { usePose } from "./usePose";

const ORIGIN = { lat: 0, lon: 0, alt_m: 0 };

function poseAt(t: number): PoseResponse {
  return { t, origin: ORIGIN, drones: {} };
}

describe("usePose", () => {
  let pending: Map<number, (v: PoseResponse) => void>;

  beforeEach(() => {
    pending = new Map();
    vi.mocked(getPose).mockImplementation((_slug, t) => {
      return new Promise((resolve) => {
        pending.set(t, resolve);
      });
    });
  });

  it("updates pose while T advances faster than getPose", async () => {
    const { rerender, result } = renderHook(
      ({ t }: { t: number }) => usePose("exp", t),
      { initialProps: { t: 0 } },
    );

    await vi.waitFor(() => expect(pending.has(0)).toBe(true));
    await act(async () => {
      pending.get(0)!(poseAt(0));
    });
    await vi.waitFor(() => expect(result.current.pose?.t).toBe(0));

    rerender({ t: 1 });
    await vi.waitFor(() => expect(pending.has(1)).toBe(true));
    rerender({ t: 2 });

    await act(async () => {
      pending.get(1)!(poseAt(1));
    });
    await vi.waitFor(() => expect(result.current.pose?.t).toBe(1));
    await vi.waitFor(() => expect(pending.has(2)).toBe(true));

    await act(async () => {
      pending.get(2)!(poseAt(2));
    });
    await vi.waitFor(() => expect(result.current.pose?.t).toBe(2));
  });
});
