import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import type { Dash, Data, Layout } from "plotly.js";
import { getSeries, type SeriesResponse } from "../api";
import { PLOT_TIME_MARGIN, experimentTimeAxis } from "../channelPlotAxis";
import { replayColor } from "../droneColor";
import { plotTheme, type Skin } from "../skin";

const COMPONENTS = ["x", "y", "z"] as const;

const NED_LINE: Record<(typeof COMPONENTS)[number], { width: number; dash: Dash }> = {
  x: { width: 2.5, dash: "solid" },
  y: { width: 1.5, dash: "dash" },
  z: { width: 1, dash: "dot" },
};

function nedChannels(droneId: string): string[] {
  return COMPONENTS.map(
    (c) => `${droneId}.ulog.vehicle_local_position.${c}`,
  );
}

type Props = {
  slug: string | null;
  visibleDroneIds: string[];
  t: number;
  tMax: number;
  refreshToken?: number;
  skin?: Skin;
};

export default function ChannelPlot({
  slug,
  visibleDroneIds,
  t,
  tMax,
  refreshToken = 0,
  skin = "night",
}: Props) {
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
  }, [slug, channels, refreshToken]);

  const traces = useMemo((): Data[] => {
    if (!series) return [];
    const out: Data[] = [];

    visibleDroneIds.forEach((id) => {
      const color = replayColor(id);
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
          line: { color, ...NED_LINE[comp] },
        });
      }
    });

    return out;
  }, [series, visibleDroneIds]);

  const layout = useMemo((): Partial<Layout> => {
    const theme = plotTheme(skin);
    return {
      paper_bgcolor: theme.paper_bgcolor,
      plot_bgcolor: theme.plot_bgcolor,
      font: { color: theme.font_color },
      margin: { ...PLOT_TIME_MARGIN },
      xaxis: { ...experimentTimeAxis(tMax), gridcolor: theme.gridcolor },
      yaxis: {
        title: { text: "NED (m)" },
        gridcolor: theme.gridcolor,
        automargin: false,
      },
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
          line: { color: theme.cursor_color, width: 1, dash: "dot" },
        },
      ],
    };
  }, [t, tMax, skin]);

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
