import type { Layout } from "plotly.js";

export function sceneLayout(opts?: {
  datarevision?: string | number;
}): Partial<Layout> {
  return {
    uirevision: "camera",
    datarevision: opts?.datarevision,
    legend: {
      x: 0.01,
      y: 0.99,
      xanchor: "left",
      yanchor: "top",
      bgcolor: "rgba(9,9,11,0.7)",
      font: { size: 11, color: "#e4e4e7" },
    },
    scene: {
      xaxis: { title: { text: "East" } },
      yaxis: { title: { text: "North" } },
      zaxis: { title: { text: "Up" } },
      aspectmode: "data",
    },
  };
}
