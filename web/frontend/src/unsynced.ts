export type SyncedDrone = { synced: boolean };

export function bannerText(
  drones: Record<string, SyncedDrone>,
): string {
  const unsynced = Object.entries(drones)
    .filter(([, d]) => !d.synced)
    .map(([id]) => id)
    .sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

  if (unsynced.length === 0) return "";

  return `ARM unsynced: ${unsynced.join(", ")}`;
}
