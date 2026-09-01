import { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { getReplaySeries } from "../api";
import { plotTheme, type Skin } from "../skin";
import { tracesForField, type FieldSeries } from "./overlayPlots";

type TopicFields = Record<string, FieldSeries>;
type SeriesMap = Record<string, TopicFields>;

function tracesForTopic(fields: TopicFields) {
  return Object.entries(fields).flatMap(([fieldName, field]) =>
    tracesForField(field).map((t) => ({
      ...t,
      name: `${fieldName} ${t.name}`,
    })),
  );
}

function skinFromDocument(): Skin {
  return document.documentElement.dataset.skin === "day" ? "day" : "night";
}

export function OverlayPlots({
  slug,
  runId,
  status,
  skin,
}: {
  slug: string;
  runId: string | null;
  status?: string;
  skin?: Skin;
}) {
  const [series, setSeries] = useState<SeriesMap | null>(null);
  const theme = plotTheme(skin ?? skinFromDocument());

  useEffect(() => {
    if (!runId || status !== "success") {
      setSeries(null);
      return;
    }
    let cancelled = false;
    getReplaySeries(slug, runId)
      .then((data) => {
        if (!cancelled) setSeries(data as SeriesMap);
      })
      .catch(() => {
        if (!cancelled) setSeries(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, runId, status]);

  if (!series) return null;

  const panes = [
    "vehicle_attitude",
    "vehicle_local_position",
    "estimator_innovations",
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      {panes.map((topic) => {
        const fields = series[topic];
        if (!fields) return null;
        return (
          <section key={topic}>
            <h2 className="mb-2 text-sm font-medium text-zinc-300">{topic}</h2>
            <Plot
              data={tracesForTopic(fields)}
              layout={{
                autosize: true,
                paper_bgcolor: theme.paper_bgcolor,
                plot_bgcolor: theme.plot_bgcolor,
                font: { color: theme.font_color },
                xaxis: { gridcolor: theme.gridcolor },
                yaxis: { gridcolor: theme.gridcolor },
              }}
            />
          </section>
        );
      })}
    </div>
  );
}
