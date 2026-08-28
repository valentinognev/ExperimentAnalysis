export type TransferProgress = {
  name: string;
  index: number;
  count: number;
  bytes: number;
  total: number;
  pct: number;
};

export function transferProgressLabel(p: TransferProgress): string {
  return `${p.name}  ${p.pct}%  (${p.index}/${p.count})`;
}
