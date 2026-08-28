export type MavlinkLogEntry = {
  id: number;
  time_utc: number;
  size: number;
};

export function mavlinkLogLabel(log: MavlinkLogEntry): string {
  const when =
    log.time_utc > 0
      ? new Date(log.time_utc * 1000).toISOString().replace(".000Z", "Z")
      : "unknown time";
  return `#${log.id}  ${when}  ${log.size} B`;
}
