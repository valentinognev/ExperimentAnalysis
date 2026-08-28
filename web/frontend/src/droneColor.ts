export const DRONE_COLORS = ["#f97316", "#22d3ee", "#a78bfa", "#f472b6"] as const;

export function droneColor(id: string | number): string {
  const n = typeof id === "number" ? id : Number(id);
  if (!Number.isInteger(n) || n < 1) return DRONE_COLORS[0];
  return DRONE_COLORS[(n - 1) % DRONE_COLORS.length];
}
