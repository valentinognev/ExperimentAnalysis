import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import type { Data, Layout } from "plotly.js";
import { getSeries, type SeriesResponse } from "../api";

const DRONE_COLORS = ["#f97316", "#22d3ee", "#a78bfa", "#f472b6"];
const COMPONENTS = ["x", "y", "z"] as const;

function nedChannels(droneId: string): string[] {
  return COMPONENTS.map(
    (c) => `${droneId}.ulog.vehicle_local_position.${c}`,
  );
}

type Props = {
  slug: string | null;
  visibleDroneIds: string[];
  t: number;
};

export default function ChannelPlot({ slug, visibleDroneIds, t }: Props) {
  const [series, setSeries] = useState<SeriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const channels = useMemo(
    () => visibleDroneIds.flatMap(nedChannels),
    [visibleDroneIds],
  );

  useEffect(() => {
    if (!slug || channels.length === 0) {
      setSeries(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);

    getSeries(slug, channels)
      .then((data) => {
        if (!cancelled) setSeries(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug, channels]);

  const traces = useMemo((): Data[] => {
    if (!series) return [];
    const out: Data[] = [];

    visibleDroneIds.forEach((id, index) => {
      const color = DRONE_COLORS[index % DRONE_COLORS.length];
      for (const comp of COMPONENTS) {
        const ch = `${id}.ulog.vehicle_local_position.${comp}`;
        const data = series[ch];
        if (!data || data.t.length === 0) continue;
        out.push({
          type: "scatter",
          mode: "lines",
          name: `D${id} ${comp}`,
          x: data.t,
          y: data.y,
          line: { color, width: 1.5 },
        });
      }
    });

    return out;
  }, [series, visibleDroneIds]);

  const layout = useMemo(
    (): Partial<Layout> => ({
      paper_bgcolor: "#09090b",
      plot_bgcolor: "#18181b",
      font: { color: "#e4e4e7" },
      margin: { l: 48, r: 16, t: 24, b: 40 },
      xaxis: { title: { text: "t (s)" }, gridcolor: "#3f3f46" },
      yaxis: { title: { text: "NED (m)" }, gridcolor: "#3f3f46" },
      showlegend: true,
      legend: { orientation: "h", y: 1.1 },
      shapes: [
        {
          type: "line",
          x0: t,
          x1: t,
          y0: 0,
          y1: 1,
          yref: "paper",
          line: { color: "#fafafa", width: 1, dash: "dot" },
        },
      ],
    }),
    [t],
  );

  if (!slug) return null;

  return (
    <div className="px-4 pb-4">
      {error && <p className="mb-2 text-sm text-red-400">Series: {error}</p>}
      <div className="h-64 rounded border border-zinc-800">
        <Plot
          data={traces}
          layout={layout}
          config={{ responsive: true }}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
