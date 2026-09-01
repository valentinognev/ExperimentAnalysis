export const REPLAY_ID_RE = /^(?<i>\d+)_r(?<j>\d+)$/;

function matchReplay(droneId: unknown): RegExpMatchArray | null {
  if (typeof droneId !== "string") return null;
  return droneId.match(REPLAY_ID_RE);
}

export function isReplayId(droneId: unknown): boolean {
  return matchReplay(droneId) !== null;
}

export function parentId(droneId: unknown): number {
  const m = matchReplay(droneId);
  if (!m?.groups) throw new Error(`not a replay id: ${String(droneId)}`);
  return Number(m.groups.i);
}

export function replayIndex(droneId: unknown): number {
  const m = matchReplay(droneId);
  if (!m?.groups) throw new Error(`not a replay id: ${String(droneId)}`);
  return Number(m.groups.j);
}

export function replayId(parent: number, j: number): string {
  return `${parent}_r${j}`;
}

export function physicalId(droneId: unknown): number | null {
  if (typeof droneId === "number" && Number.isInteger(droneId)) return droneId;
  if (typeof droneId === "string") {
    if (/^\d+$/.test(droneId)) return Number(droneId);
    const m = matchReplay(droneId);
    if (m?.groups) return Number(m.groups.i);
  }
  return null;
}

export function nextReplayIndex(existingIds: unknown[], parent: number): number {
  let maxJ = 0;
  for (const id of existingIds) {
    if (isReplayId(id) && parentId(id) === parent) {
      maxJ = Math.max(maxJ, replayIndex(id));
    }
  }
  return maxJ + 1;
}
