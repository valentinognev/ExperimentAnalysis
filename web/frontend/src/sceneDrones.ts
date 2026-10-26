import type { PoseResponse, TrajectoryResponse } from "./api";
import {
  AVATAR_KEYS,
  avatarUsesTriad,
  enabledAvatarKeys,
  type AvatarKey,
  type PoseAvatars,
} from "./avatars";
import type { DronePose } from "./components/View3D";
import { sliceTrail } from "./trail";

export type VectorConfig = { avatar?: string; scale?: number };

/** 3D bodies and trails. A source with no sample at T stays at its last logged point. */
export function sceneDrones(args: {
  pose: PoseResponse | null;
  trajectory: TrajectoryResponse | null;
  visibleDroneIds: string[];
  uiAvatars: Record<string, unknown>;
  vectorConfigs: Record<string, VectorConfig>;
}): DronePose[] {
  const { pose, trajectory, visibleDroneIds, uiAvatars, vectorConfigs } = args;
  if (!pose) return [];

  const visible = new Set(visibleDroneIds);
  const ids = new Set<string>([
    ...Object.keys(pose.drones),
    ...Object.keys(trajectory?.drones ?? {}),
  ]);
  const out: DronePose[] = [];
  const identity: [number, number, number, number] = [0, 0, 0, 1];

  for (const id of ids) {
    if (!visible.has(id)) continue;
    const drone = pose.drones[id];
    const sources = trajectory?.drones?.[id] ?? {};
    const known: PoseAvatars = { ...(drone?.avatars ?? {}) };
    for (const key of AVATAR_KEYS) {
      if (sources[key] && known[key] === undefined) {
        known[key] = { e: 0, n: 0, u: 0 };
      }
    }
    const enabled = enabledAvatarKeys(id, known, uiAvatars);
    if (enabled.length === 0) continue;

    const cfg = vectorConfigs[id];
    const vectorAvatar = (cfg?.avatar ?? "ekf_ned") as AvatarKey;

    for (const key of enabled) {
      const live = drone?.avatars?.[key];
      const series = sources[key];
      const trail = series ? sliceTrail(series, pose.t) : undefined;
      const held =
        !live && trail && trail.length > 0 ? trail[trail.length - 1] : undefined;
      const pos = live ?? held;
      if (!pos) continue;

      const useTriad =
        Boolean(live) && drone !== undefined && avatarUsesTriad(key, drone);
      const vectorBase =
        vectorAvatar === "gps" && drone?.avatars?.gps
          ? drone.avatars.gps
          : (drone?.avatars?.ekf_ned ?? pos);

      out.push({
        id,
        label: key,
        pos,
        attitude_q_xyzw: useTriad && drone?.attitude_q_xyzw ? drone.attitude_q_xyzw : identity,
        style: useTriad ? "triad" : "point",
        trail,
        vectors:
          useTriad &&
          key === vectorAvatar &&
          drone?.vectors?.velocity &&
          vectorBase
            ? {
                velocity: drone.vectors.velocity,
                scale: cfg?.scale ?? 1,
                base: vectorBase,
              }
            : undefined,
      });
    }
  }
  return out;
}
