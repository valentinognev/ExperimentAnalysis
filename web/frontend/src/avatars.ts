import type { PoseDrone } from "./api";

export type AvatarKey = "ekf_ned" | "gps" | "sm_ned" | "sm_lla";

export const AVATAR_KEYS: AvatarKey[] = ["ekf_ned", "gps", "sm_ned", "sm_lla"];

export type PoseAvatars = Partial<Record<AvatarKey, { e: number; n: number; u: number }>>;

export function availableAvatarKeys(
  avatars: PoseAvatars | undefined,
): AvatarKey[] {
  if (!avatars) return [];
  return AVATAR_KEYS.filter((k) => avatars[k] !== undefined);
}

/** Enabled avatars for a drone: saved ui list or all available (default-on). */
export function enabledAvatarKeys(
  droneId: string,
  avatars: PoseAvatars | undefined,
  uiAvatars: Record<string, unknown>,
): AvatarKey[] {
  const available = availableAvatarKeys(avatars);
  if (available.length === 0) return [];

  const saved = uiAvatars[droneId];
  if (Array.isArray(saved)) {
    return saved.filter(
      (k): k is AvatarKey =>
        typeof k === "string" && available.includes(k as AvatarKey),
    );
  }
  return available;
}

export function toggleAvatarKeys(
  saved: unknown,
  available: AvatarKey[],
  key: AvatarKey,
  checked: boolean,
): AvatarKey[] {
  const current = Array.isArray(saved)
    ? saved.filter((k): k is AvatarKey => available.includes(k as AvatarKey))
    : [...available];
  const set = new Set(current);
  if (checked) set.add(key);
  else set.delete(key);
  return available.filter((k) => set.has(k));
}

export function avatarShortLabel(key: AvatarKey): string {
  if (key === "ekf_ned") return "ekf";
  if (key === "sm_ned") return "sm ned";
  if (key === "sm_lla") return "sm lla";
  return key;
}

export function avatarLineDash(key: AvatarKey): string | undefined {
  if (key === "gps") return "dash";
  if (key === "sm_ned") return "dot";
  if (key === "sm_lla") return "dashdot";
  return undefined;
}

export function primaryAvatarPos(
  avatars: PoseAvatars | undefined,
  enabled: AvatarKey[],
): { e: number; n: number; u: number } | undefined {
  if (!avatars || enabled.length === 0) return undefined;
  for (const key of ["ekf_ned", "sm_ned", "gps", "sm_lla"] as AvatarKey[]) {
    if (enabled.includes(key) && avatars[key]) {
      return avatars[key];
    }
  }
  return undefined;
}

export function avatarUsesTriad(
  key: AvatarKey,
  drone: PoseDrone,
): boolean {
  if (key === "ekf_ned" || key === "gps") {
    return drone.present && drone.attitude_q_xyzw !== undefined;
  }
  return false;
}

export function hasMapPosition(
  drone: PoseDrone,
  key: AvatarKey,
): boolean {
  if (key === "gps" || key === "sm_lla") {
    return drone.avatars?.[key] !== undefined;
  }
  return false;
}

export function hasAnyMapAvatar(drones: Record<string, PoseDrone>): boolean {
  return Object.values(drones).some(
    (d) => availableAvatarKeys(d.avatars).length > 0,
  );
}
