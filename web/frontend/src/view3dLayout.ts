import type { Layout } from "plotly.js";

export function sceneLayout(opts?: {
  datarevision?: string | number;
}): Partial<Layout> {
  return {
    uirevision: "camera",
    datarevision: opts?.datarevision,
    scene: {
      xaxis: { title: { text: "East" } },
      yaxis: { title: { text: "North" } },
      zaxis: { title: { text: "Up" } },
      aspectmode: "data",
    },
  };
}
