import { describe, it, expect } from "vitest";
import {
  enabledAvatarKeys,
  primaryAvatarPos,
  avatarUsesTriad,
} from "./avatars";
import type { PoseDrone } from "./api";

describe("avatars", () => {
  const poseAvatars = {
    ekf_ned: { e: 1, n: 2, u: 3 },
    sm_ned: { e: 4, n: 5, u: 6 },
  };

  it("defaults to all available avatar keys", () => {
    expect(enabledAvatarKeys("2", poseAvatars, {})).toEqual([
      "ekf_ned",
      "sm_ned",
    ]);
  });

  it("respects saved ui avatar list", () => {
    expect(enabledAvatarKeys("2", poseAvatars, { "2": ["sm_ned"] })).toEqual([
      "sm_ned",
    ]);
  });

  it("primaryAvatarPos prefers ekf then sm", () => {
    expect(primaryAvatarPos(poseAvatars, ["ekf_ned", "sm_ned"])?.e).toBe(1);
    expect(primaryAvatarPos(poseAvatars, ["sm_ned"])?.e).toBe(4);
  });

  it("sm avatars use points not triads when not present", () => {
    const smOnly: PoseDrone = {
      present: false,
      synced: false,
      avatars: { sm_ned: { e: 0, n: 0, u: 0 } },
    };
    expect(avatarUsesTriad("sm_ned", smOnly)).toBe(false);
    expect(avatarUsesTriad("ekf_ned", { ...smOnly, present: true, attitude_q_xyzw: [0, 0, 0, 1] })).toBe(true);
  });
});
