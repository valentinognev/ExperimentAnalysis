import { describe, it, expect } from "vitest";
import {
  PLOT_TIME_MARGIN,
  SLIDER_EVERY_FIGURES,
  experimentTimeAxis,
  scrubberFraction,
  sliderBeforeFigure,
} from "./channelPlotAxis";

describe("scrubberFraction", () => {
  it("is t/tMax so the thumb sits on the plot time axis", () => {
    expect(scrubberFraction(0, 160)).toBe(0);
    expect(scrubberFraction(80, 160)).toBe(0.5);
    expect(scrubberFraction(160, 160)).toBe(1);
  });

  it("clamps outside [0, tMax] and treats a non-positive span as 0", () => {
    expect(scrubberFraction(-10, 160)).toBe(0);
    expect(scrubberFraction(200, 160)).toBe(1);
    expect(scrubberFraction(5, 0)).toBe(0);
  });
});

describe("plot time geometry", () => {
  it("pins left/right plot margins so a matching scrubber can share the axis", () => {
    expect(PLOT_TIME_MARGIN).toEqual({ l: 48, r: 16, t: 24, b: 40 });
  });

  it("disables automargin so those insets stay fixed", () => {
    expect(experimentTimeAxis(160).automargin).toBe(false);
  });
});

describe("sliderBeforeFigure", () => {
  it("places a scrubber before every third figure, including the first", () => {
    expect(SLIDER_EVERY_FIGURES).toBe(3);
    expect(sliderBeforeFigure(0)).toBe(true);
    expect(sliderBeforeFigure(1)).toBe(false);
    expect(sliderBeforeFigure(2)).toBe(false);
    expect(sliderBeforeFigure(3)).toBe(true);
    expect(sliderBeforeFigure(6)).toBe(true);
  });
});
