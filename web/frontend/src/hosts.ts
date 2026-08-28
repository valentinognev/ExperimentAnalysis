export function hostsFromManifest(drones: unknown): Record<string, string> {
  if (!Array.isArray(drones)) return {};
  const out: Record<string, string> = {};
  for (const raw of drones) {
    if (!raw || typeof raw !== "object") continue;
    const drone = raw as { id?: unknown; ssh?: { host?: unknown } };
    if (drone.id === undefined || drone.id === null) continue;
    const host = drone.ssh?.host;
    out[String(drone.id)] = typeof host === "string" ? host : "";
  }
  return out;
}

export function hostPatch(
  droneId: string,
  host: string,
): { drones: Record<string, unknown>[] } {
  const trimmed = host.trim();
  const drone: Record<string, unknown> = {
    id: Number(droneId),
    ssh: { host: trimmed },
  };
  if (trimmed) {
    drone.mavlink = { url: `tcp:${trimmed}:5760` };
  }
  return { drones: [drone] };
}
