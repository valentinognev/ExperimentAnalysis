export type DroneSummary = {
  ulg: string;
  date: string;
  time: string;
  sm: string[];
  ha: string[];
};

export function basename(path: string): string {
  if (!path) return "";
  const parts = path.split("/");
  return parts[parts.length - 1] ?? "";
}

const ULG_STAMP = /_(\d{4})-(\d{1,2})-(\d{1,2})-(\d{1,2})-(\d{1,2})-(\d{1,2})\.ulg$/i;

export function parseUlgStamp(filename: string): { date: string; time: string } | null {
  const m = basename(filename).match(ULG_STAMP);
  if (!m) return null;
  const pad = (n: string) => String(n).padStart(2, "0");
  return {
    date: `${m[1]}-${pad(m[2]!)}-${pad(m[3]!)}`,
    time: `${pad(m[4]!)}:${pad(m[5]!)}:${pad(m[6]!)}`,
  };
}

function stringBasenames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string").map(basename);
}

export function summariesFromManifest(drones: unknown): Record<string, DroneSummary> {
  if (!Array.isArray(drones)) return {};
  const out: Record<string, DroneSummary> = {};
  for (const raw of drones) {
    if (!raw || typeof raw !== "object") continue;
    const drone = raw as {
      id?: unknown;
      sources?: { ulg?: unknown; system_manager?: unknown; hardware_adapter?: unknown };
    };
    if (drone.id === undefined || drone.id === null) continue;
    const ulgPaths = stringBasenames(drone.sources?.ulg);
    const ulg = ulgPaths.length > 0 ? ulgPaths[ulgPaths.length - 1]! : "—";
    const stamp = ulg === "—" ? null : parseUlgStamp(ulg);
    out[String(drone.id)] = {
      ulg,
      date: stamp?.date ?? "—",
      time: stamp?.time ?? "—",
      sm: stringBasenames(drone.sources?.system_manager),
      ha: stringBasenames(drone.sources?.hardware_adapter),
    };
  }
  return out;
}
