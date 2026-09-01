export const PLOT_TIME_MARGIN = { l: 48, r: 16, t: 24, b: 40 } as const;

/** NED ChannelPlot is figure 0; extra panes follow. */
export const LEADING_TIME_FIGURES = 1;

export const SLIDER_EVERY_FIGURES = 3;

export function sliderBeforeFigure(
  figureIndex: number,
  every = SLIDER_EVERY_FIGURES,
): boolean {
  return figureIndex % every === 0;
}

export function experimentTimeAxis(tMax: number) {
  return {
    title: { text: "t (s)" },
    gridcolor: "#3f3f46",
    range: [0, tMax] as [number, number],
    autorange: false as const,
    automargin: false as const,
  };
}

export function scrubberFraction(t: number, tMax: number): number {
  if (!(tMax > 0) || !Number.isFinite(t)) return 0;
  return Math.min(1, Math.max(0, t / tMax));
}
