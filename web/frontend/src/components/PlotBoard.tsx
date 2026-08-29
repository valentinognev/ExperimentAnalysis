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
import { experimentTimeAxis } from "../channelPlotAxis";
import { plotTheme, type Skin } from "../skin";
import ChannelPicker from "./ChannelPicker";

const TRACE_COLORS = ["#f97316", "#22d3ee", "#a78bfa", "#f472b6", "#4ade80"];

function tCursorShape(
  t: number,
  color: string,
): NonNullable<Layout["shapes"]>[number] {
  return {
    type: "line",
    x0: t,
    x1: t,
    y0: 0,
    y1: 1,
    yref: "paper",
    line: { color, width: 1, dash: "dot" },
  };
}

type PlotPaneProps = {
  slug: string;
  plot: PlotDef;
  t: number;
  tMax: number;
  refreshToken: number;
  onEdit: (plot: PlotDef) => void;
  onRemove: (id: string) => void;
  skin?: Skin;
};

function PlotPane({
  slug,
  plot,
  t,
  tMax,
  refreshToken,
  onEdit,
  onRemove,
  skin = "night",
}: PlotPaneProps) {
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

  const layout = useMemo((): Partial<Layout> => {
    const theme = plotTheme(skin);
    return {
      paper_bgcolor: theme.paper_bgcolor,
      plot_bgcolor: theme.plot_bgcolor,
      font: { color: theme.font_color },
      margin: { l: 48, r: 16, t: 24, b: 40 },
      xaxis: { ...experimentTimeAxis(tMax), gridcolor: theme.gridcolor },
      yaxis: { gridcolor: theme.gridcolor },
      showlegend: true,
      legend: { orientation: "h", y: 1.1 },
      shapes: [tCursorShape(t, theme.cursor_color)],
    };
  }, [t, tMax, skin]);

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
  tMax: number;
  refreshToken?: number;
  plots: PlotDef[];
  onPlotsChange: (plots: PlotDef[]) => void;
  skin?: Skin;
};

export default function PlotBoard({
  slug,
  t,
  tMax,
  refreshToken = 0,
  plots,
  onPlotsChange,
  skin = "night",
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
    if (id === editingId) closePicker();
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
          tMax={tMax}
          refreshToken={refreshToken}
          onEdit={handleEdit}
          onRemove={handleRemove}
          skin={skin}
        />
      ))}
    </div>
  );
}
