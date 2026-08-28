import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import type { Data, Layout } from "plotly.js";
import { getSeries, getTopics, type SeriesResponse } from "../api";
import {
  addPlot,
  removePlot,
  setPlotChannels,
  topicsToChannelTree,
  type PlotDef,
  type TopicsTree,
} from "../plotBoard";
import ChannelPicker from "./ChannelPicker";

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
  onEdit: (plot: PlotDef) => void;
  onRemove: (id: string) => void;
};

function PlotPane({ slug, plot, t, refreshToken, onEdit, onRemove }: PlotPaneProps) {
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
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
            onClick={() => onEdit(plot)}
          >
            Edit
          </button>
          <button
            type="button"
            className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
            onClick={() => onRemove(plot.id)}
          >
            Remove
          </button>
        </div>
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
  const [topics, setTopics] = useState<TopicsTree>({});
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  const closePicker = () => {
    setPickerOpen(false);
    setSelected(new Set());
    setEditingId(null);
  };

  useEffect(() => {
    setPickerOpen(false);
    setSelected(new Set());
    setEditingId(null);
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setTopics({});
      setTopicsError(null);
      return;
    }

    let cancelled = false;
    setTopicsError(null);

    getTopics(slug)
      .then((tree) => {
        if (!cancelled) setTopics(tree);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setTopicsError(e instanceof Error ? e.message : String(e));
          setTopics({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug, refreshToken]);

  const handleApply = () => {
    const channels = [...selected].sort();
    if (editingId) {
      onPlotsChange(setPlotChannels(plots, editingId, channels));
    } else {
      onPlotsChange(addPlot(plots, channels));
    }
    closePicker();
  };

  const handleEdit = (plot: PlotDef) => {
    setEditingId(plot.id);
    setSelected(new Set(plot.channels));
    setPickerOpen(true);
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
          onClick={() => {
            setPickerOpen((open) => !open);
            setEditingId(null);
            setSelected(new Set());
          }}
        >
          Add plot
        </button>
        {topicsError && (
          <span className="text-sm text-red-400">Topics: {topicsError}</span>
        )}
      </div>

      {pickerOpen && (
        <ChannelPicker
          nodes={topicsToChannelTree(topics)}
          selected={selected}
          onSelectedChange={setSelected}
          onApply={handleApply}
          onCancel={closePicker}
        />
      )}

      {plots.map((plot) => (
        <PlotPane
          key={plot.id}
          slug={slug}
          plot={plot}
          t={t}
          refreshToken={refreshToken}
          onEdit={handleEdit}
          onRemove={handleRemove}
        />
      ))}
    </div>
  );
}
