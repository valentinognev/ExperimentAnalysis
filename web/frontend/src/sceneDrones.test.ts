import { describe, expect, it } from "vitest";
import type { PoseResponse, TrajectoryResponse } from "./api";
import { sceneDrones } from "./sceneDrones";

const trajectory: TrajectoryResponse = {
  origin: { lat: 0, lon: 0, alt_m: 0 },
  drones: {
    "3": {
      ekf_ned: {
        t: [80, 81, 82],
        e: [1, 2, 3],
        n: [4, 5, 6],
        u: [0.1, 0.2, 0.3],
      },
      gps: {
        t: [80, 80.5],
        e: [9, 8],
        n: [1, 1],
        u: [0, 0],
      },
    },
  },
};

describe("sceneDrones", () => {
  it("keeps the logged trail and last position after that source ends", () => {
    const pose: PoseResponse = {
      t: 84,
      origin: { lat: 0, lon: 0, alt_m: 0 },
      drones: { "3": { present: false, synced: true } },
    };

    const drones = sceneDrones({
      pose,
      trajectory,
      visibleDroneIds: ["3"],
      uiAvatars: {},
      vectorConfigs: {},
    });

    const ekf = drones.find((d) => d.id === "3" && d.label === "ekf_ned");
    expect(ekf?.pos).toEqual({ e: 3, n: 6, u: 0.3 });
    expect(ekf?.style).toBe("point");
    expect(ekf?.trail?.map((p) => p.e)).toEqual([1, 2, 3]);

    const gps = drones.find((d) => d.id === "3" && d.label === "gps");
    expect(gps?.pos).toEqual({ e: 8, n: 1, u: 0 });
    expect(gps?.trail?.map((p) => p.e)).toEqual([9, 8]);
  });

  it("uses the live pose and slices the trail to T while the log still covers T", () => {
    const pose: PoseResponse = {
      t: 81,
      origin: { lat: 0, lon: 0, alt_m: 0 },
      drones: {
        "3": {
          present: true,
          synced: true,
          attitude_q_xyzw: [0, 0, 0, 1],
          avatars: { ekf_ned: { e: 2.5, n: 5.5, u: 1 } },
        },
      },
    };

    const drones = sceneDrones({
      pose,
      trajectory,
      visibleDroneIds: ["3"],
      uiAvatars: {},
      vectorConfigs: {},
    });

    const ekf = drones.find((d) => d.label === "ekf_ned");
    expect(ekf?.pos).toEqual({ e: 2.5, n: 5.5, u: 1 });
    expect(ekf?.style).toBe("triad");
    expect(ekf?.trail?.map((p) => p.e)).toEqual([1, 2]);

    const gps = drones.find((d) => d.label === "gps");
    expect(gps?.pos).toEqual({ e: 8, n: 1, u: 0 });
    expect(gps?.style).toBe("point");
  });

  it("omits a source the operator turned off", () => {
    const pose: PoseResponse = {
      t: 84,
      origin: { lat: 0, lon: 0, alt_m: 0 },
      drones: { "3": { present: false, synced: true } },
    };

    const drones = sceneDrones({
      pose,
      trajectory,
      visibleDroneIds: ["3"],
      uiAvatars: { "3": ["gps"] },
      vectorConfigs: {},
    });

    expect(drones.map((d) => d.label)).toEqual(["gps"]);
  });
});
