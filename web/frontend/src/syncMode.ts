import { isReplayId } from "./replayId";

export type SyncMode = "arm" | "manual";

export function parseSyncMode(raw: unknown): SyncMode {
  return raw === "manual" ? "manual" : "arm";
}

export function physicalSyncIds(droneIds: string[]): string[] {
  return droneIds.filter((id) => !isReplayId(id));
}

export function rebaseOffsets(
  offsets: Record<string, number>,
  newMain: string,
  ids: string[],
): Record<string, number> {
  const base = offsets[newMain] ?? 0;
  const next: Record<string, number> = {};
  for (const id of ids) {
    const value = offsets[id] ?? 0;
    next[id] = id === newMain ? 0 : value - base;
  }
  next[newMain] = 0;
  return next;
}

export function parseOffsetInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed === "-" || trimmed === "." || trimmed === "-.") return null;
  if (/^-?\d+\.$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}
