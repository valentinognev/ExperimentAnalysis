import type { Layout } from "plotly.js";
import { plotTheme, type PlotTheme, type Skin } from "./skin";

function sceneAxis(
  title: string,
  theme: PlotTheme,
): NonNullable<Layout["scene"]>["xaxis"] {
  return {
    title: { text: title },
    color: theme.axis_color,
    gridcolor: theme.gridcolor,
    backgroundcolor: theme.scene_bgcolor,
    showbackground: true,
  };
}

export function sceneLayout(opts?: {
  datarevision?: string | number;
  skin?: Skin;
  origin?: { lat: number; lon: number; alt_m: number };
}): Partial<Layout> {
  const theme = plotTheme(opts?.skin ?? "night");
  const origin = opts?.origin;
  const uirevision =
    origin !== undefined
      ? `camera:${origin.lat.toFixed(6)},${origin.lon.toFixed(6)}`
      : "camera";
  return {
    uirevision,
    datarevision: opts?.datarevision,
    paper_bgcolor: theme.paper_bgcolor,
    legend: {
      x: 0.01,
      y: 0.99,
      xanchor: "left",
      yanchor: "top",
      bgcolor: theme.legend_bgcolor,
      font: { size: 11, color: theme.legend_font_color },
    },
    scene: {
      bgcolor: theme.scene_bgcolor,
      xaxis: sceneAxis("East", theme),
      yaxis: sceneAxis("North", theme),
      zaxis: sceneAxis("Up", theme),
      aspectmode: "data",
    },
  };
}
