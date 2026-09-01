import { isReplayId, parentId, replayIndex } from "./replayId";

/** Keep in sync with ObservationBoard `web/frontend/src/utils/droneColors.ts`. */
export const DRONE_COLORS = [
  "#FF2D00",
  "#008CFF",
  "#00D615",
  "#FFD200",
  "#BE00FF",
  "#FF00D9",
  "#00E0E0",
  "#FF8800",
  "#8FDF00",
] as const;

export function droneColor(id: string | number): string {
  const n = typeof id === "number" ? id : Number(id);
  if (!Number.isInteger(n) || n < 1) return DRONE_COLORS[0];
  return DRONE_COLORS[(n - 1) % DRONE_COLORS.length];
}

function mixChannel(a: number, b: number, t: number): number {
  return Math.min(255, Math.max(0, Math.round(a + (b - a) * t)));
}

function toHexByte(n: number): string {
  return n.toString(16).padStart(2, "0").toUpperCase();
}

export function mixHex(hex: string, toward: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const mix = (shift: number) =>
    mixChannel((a >> shift) & 255, (b >> shift) & 255, t);
  return `#${toHexByte(mix(16))}${toHexByte(mix(8))}${toHexByte(mix(0))}`;
}

export function replayColor(id: string | number): string {
  if (!isReplayId(id)) return droneColor(id);
  const j = replayIndex(id);
  const t = Math.min(Math.ceil(j / 2) * 0.18, 0.72);
  const toward = j % 2 === 1 ? "#ffffff" : "#000000";
  return mixHex(droneColor(parentId(id)), toward, t);
}
