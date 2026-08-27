export function filterVisible(
  ids: string[],
  visible: Set<string> | string[],
): string[] {
  const vis = visible instanceof Set ? visible : new Set(visible);
  if (vis.size === 0) return [];
  return ids.filter((id) => vis.has(id));
}
