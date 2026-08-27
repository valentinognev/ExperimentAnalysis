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
