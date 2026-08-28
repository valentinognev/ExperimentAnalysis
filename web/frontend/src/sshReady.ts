export function sshReadyFromManifest(drones: unknown): Record<string, boolean> {
  if (!Array.isArray(drones)) return {};
  const out: Record<string, boolean> = {};
  for (const raw of drones) {
    if (!raw || typeof raw !== "object") continue;
    const drone = raw as {
      id?: unknown;
      sources?: { system_manager?: unknown; hardware_adapter?: unknown };
    };
    if (drone.id === undefined || drone.id === null) continue;
    const sm = drone.sources?.system_manager;
    const ha = drone.sources?.hardware_adapter;
    const hasSm = Array.isArray(sm) && sm.length > 0;
    const hasHa = Array.isArray(ha) && ha.length > 0;
    out[String(drone.id)] = hasSm || hasHa;
  }
  return out;
}
