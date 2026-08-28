import { basename, parseUlgStamp } from "./droneSummary";

const WINDOW_MS = 24 * 60 * 60 * 1000;

const DASHED =
  /(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/;
const COMPACT = /^(\d{4})(\d{2})(\d{2})(?:[._]|$)/;

export type Stampable = {
  kind: "sm" | "ha";
  name: string;
  key: string;
};

export function stampMs(date: string, time: string): number | null {
  if (!date || date === "—" || !time || time === "—") return null;
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!dm || !tm) return null;
  return localMs(
    Number(dm[1]),
    Number(dm[2]),
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2]),
    Number(tm[3]),
  );
}

function localMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number {
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}

export function parseLogStamp(filename: string): number | null {
  const name = basename(filename);
  const ulg = parseUlgStamp(name);
  if (ulg) return stampMs(ulg.date, ulg.time);

  const dashed = name.match(DASHED);
  if (dashed) {
    return localMs(
      Number(dashed[1]),
      Number(dashed[2]),
      Number(dashed[3]),
      Number(dashed[4]),
      Number(dashed[5]),
      Number(dashed[6]),
    );
  }

  const compact = name.match(COMPACT);
  if (compact) {
    return localMs(
      Number(compact[1]),
      Number(compact[2]),
      Number(compact[3]),
      0,
      0,
      0,
    );
  }
  return null;
}

export function rankByUlg<T extends { name: string }>(
  items: T[],
  ulgMs: number | null,
): T[] {
  if (ulgMs == null) return items;
  return [...items].sort((a, b) => {
    const da = parseLogStamp(a.name);
    const db = parseLogStamp(b.name);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return Math.abs(da - ulgMs) - Math.abs(db - ulgMs);
  });
}

export function preselectKeys<T extends Stampable>(
  items: T[],
  ulgMs: number | null,
  windowMs = WINDOW_MS,
): string[] {
  if (ulgMs == null) return [];
  const keys: string[] = [];
  for (const kind of ["sm", "ha"] as const) {
    let best: T | undefined;
    let bestDelta = Infinity;
    for (const item of items) {
      if (item.kind !== kind) continue;
      const t = parseLogStamp(item.name);
      if (t == null) continue;
      const d = Math.abs(t - ulgMs);
      if (d < bestDelta) {
        bestDelta = d;
        best = item;
      }
    }
    if (best && bestDelta <= windowMs) keys.push(best.key);
  }
  return keys;
}
