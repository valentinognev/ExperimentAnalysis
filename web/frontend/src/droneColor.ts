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
