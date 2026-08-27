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
