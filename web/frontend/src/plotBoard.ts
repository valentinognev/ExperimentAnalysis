export type PlotDef = {
  id: string;
  channels: string[];
};

export type TopicsTree = Record<
  string,
  Record<string, Record<string, string[]>>
>;

function newPlotId(): string {
  return crypto.randomUUID();
}

export function addPlot(plots: PlotDef[], channels: string[]): PlotDef[] {
  return [...plots, { id: newPlotId(), channels: [...channels] }];
}

export function removePlot(plots: PlotDef[], id: string): PlotDef[] {
  return plots.filter((p) => p.id !== id);
}

export function setPlotChannels(
  plots: PlotDef[],
  id: string,
  channels: string[],
): PlotDef[] {
  return plots.map((p) =>
    p.id === id ? { ...p, channels: [...channels] } : p,
  );
}

/** Returns [] when slug changes; null when unchanged (no plot reset). */
export function plotsOnSlugChange(
  prevSlug: string | null,
  nextSlug: string | null,
): PlotDef[] | null {
  return prevSlug !== nextSlug ? [] : null;
}

export function plotsForSlug(
  prevSlug: string | null,
  nextSlug: string | null,
  plots: PlotDef[],
): PlotDef[] {
  const cleared = plotsOnSlugChange(prevSlug, nextSlug);
  return cleared ?? plots;
}

export function flattenTopics(tree: TopicsTree): string[] {
  const out: string[] = [];
  for (const [drone, sources] of Object.entries(tree)) {
    for (const [source, topics] of Object.entries(sources)) {
      for (const [topic, fields] of Object.entries(topics)) {
        for (const field of fields) {
          out.push(`${drone}.${source}.${topic}.${field}`);
        }
      }
    }
  }
  return out.sort();
}

export type ChannelNode = {
  id: string;
  label: string;
  children?: ChannelNode[];
};

function sortKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.localeCompare(b);
  });
}

const INSTANCE_SUFFIX = /^(.+)\.(\d{2})$/;

function fieldLeaves(prefix: string, fields: string[]): ChannelNode[] {
  return [...fields].sort().map((field) => ({
    id: `${prefix}.${field}`,
    label: field,
  }));
}

function topicChildren(
  drone: string,
  source: string,
  topics: Record<string, string[]>,
): ChannelNode[] {
  const grouped = new Map<string, { inst: string; fields: string[] }[]>();
  const plain: string[] = [];
  for (const topic of Object.keys(topics)) {
    const match = topic.match(INSTANCE_SUFFIX);
    if (match) {
      const parent = match[1];
      const list = grouped.get(parent) ?? [];
      list.push({ inst: match[2], fields: topics[topic] });
      grouped.set(parent, list);
    } else {
      plain.push(topic);
    }
  }

  const nodes: ChannelNode[] = plain.map((topic) => ({
    id: `${drone}.${source}.${topic}`,
    label: topic,
    children: fieldLeaves(`${drone}.${source}.${topic}`, topics[topic]),
  }));
  for (const [parent, insts] of grouped) {
    nodes.push({
      id: `${drone}.${source}.${parent}`,
      label: parent,
      children: insts
        .sort((a, b) => a.inst.localeCompare(b.inst))
        .map(({ inst, fields }) => ({
          id: `${drone}.${source}.${parent}.${inst}`,
          label: inst,
          children: fieldLeaves(`${drone}.${source}.${parent}.${inst}`, fields),
        })),
    });
  }
  return nodes.sort((a, b) => a.label.localeCompare(b.label));
}

export function topicsToChannelTree(tree: TopicsTree): ChannelNode[] {
  return sortKeys(Object.keys(tree)).map((drone) => ({
    id: drone,
    label: drone,
    children: sortKeys(Object.keys(tree[drone])).map((source) => ({
      id: `${drone}.${source}`,
      label: source,
      children: topicChildren(drone, source, tree[drone][source]),
    })),
  }));
}

export function filterChannelTree(nodes: ChannelNode[], query: string): ChannelNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const out: ChannelNode[] = [];
  for (const node of nodes) {
    if (node.children?.length) {
      const children = filterChannelTree(node.children, query);
      if (children.length) out.push({ ...node, children });
    } else if (node.id.toLowerCase().includes(q)) {
      out.push(node);
    }
  }
  return out;
}

export function channelLeaves(node: ChannelNode): string[] {
  if (!node.children?.length) return [node.id];
  return node.children.flatMap(channelLeaves);
}

export function selectionAfterToggle(
  selected: ReadonlySet<string>,
  node: ChannelNode,
): Set<string> {
  const leaves = channelLeaves(node);
  const allOn = leaves.every((id) => selected.has(id));
  const next = new Set(selected);
  if (allOn) for (const id of leaves) next.delete(id);
  else for (const id of leaves) next.add(id);
  return next;
}

export function leafSelectionState(
  selected: ReadonlySet<string>,
  node: ChannelNode,
): "none" | "some" | "all" {
  const leaves = channelLeaves(node);
  const n = leaves.filter((id) => selected.has(id)).length;
  if (n === 0) return "none";
  if (n === leaves.length) return "all";
  return "some";
}
