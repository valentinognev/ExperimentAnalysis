import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import type { Data, Layout } from "plotly.js";
import { getSeries, getTopics, type SeriesResponse } from "../api";
import {
  addPlot,
  flattenTopics,
  removePlot,
  type PlotDef,
} from "../plotBoard";

const TRACE_COLORS = ["#f97316", "#22d3ee", "#a78bfa", "#f472b6", "#4ade80"];

function tCursorShape(t: number): NonNullable<Layout["shapes"]>[number] {
  return {
    type: "line",
    x0: t,
    x1: t,
    y0: 0,
    y1: 1,
    yref: "paper",
    line: { color: "#fafafa", width: 1, dash: "dot" },
  };
}

type PlotPaneProps = {
  slug: string;
  plot: PlotDef;
  t: number;
  refreshToken: number;
  onRemove: (id: string) => void;
};

function PlotPane({ slug, plot, t, refreshToken, onRemove }: PlotPaneProps) {
  const [series, setSeries] = useState<SeriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (plot.channels.length === 0) {
      setSeries(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);

    getSeries(slug, plot.channels)
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
  }, [slug, plot.channels, refreshToken]);

  const traces = useMemo((): Data[] => {
    if (!series) return [];
    return plot.channels
      .map((ch, index) => {
        const data = series[ch];
        if (!data || data.t.length === 0) return null;
        return {
          type: "scatter" as const,
          mode: "lines" as const,
          name: ch,
          x: data.t,
          y: data.y,
          line: { color: TRACE_COLORS[index % TRACE_COLORS.length], width: 1.5 },
        };
      })
      .filter((trace): trace is NonNullable<typeof trace> => trace !== null);
  }, [series, plot.channels]);

  const layout = useMemo(
    (): Partial<Layout> => ({
      paper_bgcolor: "#09090b",
      plot_bgcolor: "#18181b",
      font: { color: "#e4e4e7" },
      margin: { l: 48, r: 16, t: 24, b: 40 },
      xaxis: { title: { text: "t (s)" }, gridcolor: "#3f3f46" },
      yaxis: { gridcolor: "#3f3f46" },
      showlegend: true,
      legend: { orientation: "h", y: 1.1 },
      shapes: [tCursorShape(t)],
    }),
    [t],
  );

  return (
    <div className="rounded border border-zinc-800 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-zinc-400">
          {plot.channels.join(", ") || "(no channels)"}
        </span>
        <button
          type="button"
          className="shrink-0 rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
          onClick={() => onRemove(plot.id)}
        >
          Remove
        </button>
      </div>
      {error && <p className="mb-2 text-sm text-red-400">Series: {error}</p>}
      <div className="h-64">
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

type Props = {
  slug: string | null;
  t: number;
  refreshToken?: number;
  plots: PlotDef[];
  onPlotsChange: (plots: PlotDef[]) => void;
};

export default function PlotBoard({
  slug,
  t,
  refreshToken = 0,
  plots,
  onPlotsChange,
}: Props) {
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPickerOpen(false);
    setSelected(new Set());
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setChannelIds([]);
      setTopicsError(null);
      return;
    }

    let cancelled = false;
    setTopicsError(null);

    getTopics(slug)
      .then((tree) => {
        if (!cancelled) setChannelIds(flattenTopics(tree));
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setTopicsError(e instanceof Error ? e.message : String(e));
          setChannelIds([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug, refreshToken]);

  const toggleChannel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddPlot = () => {
    if (selected.size === 0) return;
    onPlotsChange(addPlot(plots, [...selected].sort()));
    setSelected(new Set());
    setPickerOpen(false);
  };

  const handleRemove = (id: string) => {
    onPlotsChange(removePlot(plots, id));
  };

  if (!slug) return null;

  return (
    <div className="space-y-3 px-4 pb-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
          onClick={() => setPickerOpen((open) => !open)}
        >
          Add plot
        </button>
        {topicsError && (
          <span className="text-sm text-red-400">Topics: {topicsError}</span>
        )}
      </div>

      {pickerOpen && (
        <div className="max-h-48 overflow-y-auto rounded border border-zinc-700 bg-zinc-900 p-2">
          {channelIds.length === 0 ? (
            <p className="text-sm text-zinc-500">No channels available</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {channelIds.map((id) => (
                <li key={id}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={() => toggleChannel(id)}
                    />
                    <span className="font-mono text-xs">{id}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded bg-orange-600 px-3 py-1 text-sm hover:bg-orange-500 disabled:opacity-50"
              disabled={selected.size === 0}
              onClick={handleAddPlot}
            >
              Add ({selected.size})
            </button>
            <button
              type="button"
              className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
              onClick={() => {
                setPickerOpen(false);
                setSelected(new Set());
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {plots.map((plot) => (
        <PlotPane
          key={plot.id}
          slug={slug}
          plot={plot}
          t={t}
          refreshToken={refreshToken}
          onRemove={handleRemove}
        />
      ))}
    </div>
  );
}
