import { describe, it, expect, vi } from "vitest";
import { createPoseQuery } from "./poseQuery";
import type { PoseResponse } from "./api";

const ORIGIN = { lat: 0, lon: 0, alt_m: 0 };

function poseAt(t: number): PoseResponse {
  return { t, origin: ORIGIN, drones: {} };
}

function deferredPose() {
  const pending = new Map<
    number,
    { resolve: (v: PoseResponse) => void; reject: (e: unknown) => void }
  >();
  const getPose = vi.fn((_slug: string, t: number) => {
    return new Promise<PoseResponse>((resolve, reject) => {
      pending.set(t, { resolve, reject });
    });
  });
  return { pending, getPose };
}

describe("createPoseQuery", () => {
  it("applies an in-flight pose after T has moved on, then fetches the latest T", async () => {
    const { pending, getPose } = deferredPose();
    const onPose = vi.fn();
    const onError = vi.fn();
    const q = createPoseQuery({ getPose, onPose, onError });

    q.setTarget("exp", 0);
    expect(getPose).toHaveBeenCalledTimes(1);
    pending.get(0)!.resolve(poseAt(0));
    await vi.waitFor(() => expect(onPose).toHaveBeenLastCalledWith(poseAt(0)));

    q.setTarget("exp", 1);
    await vi.waitFor(() => expect(pending.has(1)).toBe(true));
    q.setTarget("exp", 2);
    q.setTarget("exp", 3);

    pending.get(1)!.resolve(poseAt(1));
    await vi.waitFor(() => expect(onPose).toHaveBeenCalledWith(poseAt(1)));
    await vi.waitFor(() => expect(pending.has(3)).toBe(true));
    expect(pending.has(2)).toBe(false);

    pending.get(3)!.resolve(poseAt(3));
    await vi.waitFor(() => expect(onPose).toHaveBeenLastCalledWith(poseAt(3)));

    q.dispose();
  });

  it("does not apply a result after dispose", async () => {
    const { pending, getPose } = deferredPose();
    const onPose = vi.fn();
    const q = createPoseQuery({ getPose, onPose, onError: vi.fn() });

    q.setTarget("exp", 0);
    await vi.waitFor(() => expect(pending.has(0)).toBe(true));
    q.dispose();
    pending.get(0)!.resolve(poseAt(0));
    await Promise.resolve();
    expect(onPose).not.toHaveBeenCalled();
  });
});
