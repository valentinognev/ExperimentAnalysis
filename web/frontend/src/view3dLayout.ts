import type { Layout } from "plotly.js";

export function sceneLayout(): Partial<Layout> {
  return {
    scene: {
      xaxis: { title: { text: "East" } },
      yaxis: { title: { text: "North" } },
      zaxis: { title: { text: "Up" } },
      aspectmode: "data",
    },
  };
}
