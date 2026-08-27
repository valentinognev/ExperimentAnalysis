export type Direction = -1 | 0 | 1;
export type Speed = 0.25 | 1 | 2 | 4;

export function advance(
  t: number,
  dt: number,
  direction: Direction,
  speed: Speed,
  tMax: number,
): number {
  const next = t + direction * speed * dt;
  return Math.min(tMax, Math.max(0, next));
}
