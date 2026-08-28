export function idsChanged(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return true;
  }
  return false;
}

export function filterVisible(
  ids: string[],
  visible: Set<string> | string[],
): string[] {
  const vis = visible instanceof Set ? visible : new Set(visible);
  if (vis.size === 0) return [];
  return ids.filter((id) => vis.has(id));
}

/** Listed ids first (stable), then pose-only extras, deduplicated. */
export function mergeDroneIds(listed: string[], poseIds: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of listed) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of poseIds) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

/** Highest physical id in 1..9, or 0 if none. */
export function droneCountFromIds(ids: string[]): number {
  let max = 0;
  for (const raw of ids) {
    const id = Number(raw);
    if (Number.isInteger(id) && id >= 1 && id <= 9 && id > max) max = id;
  }
  return max;
}

/** Consecutive D1..DN so the count field matches the number of rows. */
export function droneRowsForCount(n: number): string[] {
  const count = Math.max(0, Math.min(9, Math.trunc(n)));
  if (count < 1) return [];
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

export function droneRowsFromIds(ids: string[]): string[] {
  return droneRowsForCount(droneCountFromIds(ids));
}
