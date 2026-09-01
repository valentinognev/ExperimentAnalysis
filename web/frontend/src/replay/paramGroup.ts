export type ParamRow = { name: string; value: number | string };

export type ParamGroup = {
  group: string;
  path: string;
  groups: ParamGroup[];
  params: ParamRow[];
};

export function groupKey(name: string): string {
  const i = name.indexOf("_");
  return i === -1 ? name : name.slice(0, i);
}

function afterPrefix(name: string, prefixParts: string[]): string {
  const prefix = prefixParts.join("_");
  if (name === prefix) return "";
  const want = prefix + "_";
  return name.startsWith(want) ? name.slice(want.length) : "";
}

function nextToken(remaining: string): string {
  const i = remaining.indexOf("_");
  return i === -1 ? remaining : remaining.slice(0, i);
}

function nest(params: ParamRow[], prefixParts: string[]): ParamGroup {
  const tagged = params.map((p) => {
    const rest = afterPrefix(p.name, prefixParts);
    return { p, tok: rest === "" ? null : nextToken(rest) };
  });
  const counts = new Map<string, number>();
  for (const { tok } of tagged) {
    if (tok) counts.set(tok, (counts.get(tok) ?? 0) + 1);
  }
  const grouped = new Map<string, ParamRow[]>();
  const leaves: ParamRow[] = [];
  for (const { p, tok } of tagged) {
    if (tok && (counts.get(tok) ?? 0) >= 2) {
      const list = grouped.get(tok);
      if (list) list.push(p);
      else grouped.set(tok, [p]);
    } else {
      leaves.push(p);
    }
  }
  const groups = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tok, rows]) => nest(rows, [...prefixParts, tok]));
  return {
    group: prefixParts[prefixParts.length - 1],
    path: prefixParts.join("/"),
    groups,
    params: leaves,
  };
}

export function groupParams(params: ParamRow[]): ParamGroup[] {
  const map = new Map<string, ParamRow[]>();
  for (const p of params) {
    const k = groupKey(p.name);
    const list = map.get(k);
    if (list) list.push(p);
    else map.set(k, [p]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, rows]) => nest(rows, [group]));
}

export function paramCount(node: ParamGroup): number {
  return node.params.length + node.groups.reduce((n, g) => n + paramCount(g), 0);
}
