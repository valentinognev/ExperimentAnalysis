import { isReplayId, parentId, physicalId, replayIndex } from "./replayId";

export function orderedDroneIds(
  ids: Array<string | number>,
  physicalCount: number,
): string[] {
  const replayByParent = new Map<number, string[]>();
  for (const id of ids) {
    const phys = physicalId(id);
    if (phys === null || phys < 1 || phys > physicalCount) continue;
    if (!isReplayId(id)) continue;
    const parent = parentId(id);
    const list = replayByParent.get(parent) ?? [];
    list.push(String(id));
    replayByParent.set(parent, list);
  }

  const out: string[] = [];
  for (let k = 1; k <= physicalCount; k++) {
    out.push(String(k));
    const replays = replayByParent.get(k) ?? [];
    replays.sort((a, b) => replayIndex(a) - replayIndex(b));
    out.push(...replays);
  }
  return out;
}
