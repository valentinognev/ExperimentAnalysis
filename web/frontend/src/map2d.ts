import type { Data, Layout } from "plotly.js";

export type MapPoint = {
  lat: number;
  lon: number;
  name?: string;
  color?: string;
};

export type MapFigure = {
  data: Data[];
  layout: Partial<Layout>;
};

const DRONE_COLORS = ["#f97316", "#22d3ee", "#a78bfa", "#f472b6"];

export function mapLayout(): Partial<Layout> {
  return {
    map: { style: "open-street-map" },
    margin: { l: 0, r: 0, t: 0, b: 0 },
    showlegend: true,
    legend: { orientation: "h", y: 1.02 },
  };
}

export function mapTraces(points: MapPoint[]): Data[] {
  if (points.length === 0) return [];

  return [
    {
      type: "scattermap",
      mode: "markers",
      name: "Map",
      lat: points.map((p) => p.lat),
      lon: points.map((p) => p.lon),
      text: points.map((p) => p.name ?? ""),
      marker: {
        size: 10,
        color: points.map(
          (p, i) => p.color ?? DRONE_COLORS[i % DRONE_COLORS.length],
        ),
      },
      showlegend: true,
    },
  ];
}

export function mapFigure(points: MapPoint[]): MapFigure {
  return {
    data: mapTraces(points),
    layout: mapLayout(),
  };
}
