export type SshLogEntry = {
  kind: "sm" | "ha";
  name: string;
  remote: string;
  size: number;
  mtime: string;
};

export function sshLogLabel(log: SshLogEntry): string {
  const kind = log.kind === "sm" ? "SM" : "HA";
  return `${kind}  ${log.name}  ${log.mtime}  ${log.size} B`;
}
