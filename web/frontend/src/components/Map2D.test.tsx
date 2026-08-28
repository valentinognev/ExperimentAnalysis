// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { CSSProperties } from "react";
import type { PoseResponse, TrajectoryResponse } from "../api";

type PlotProps = {
  layout?: { height?: number; autosize?: boolean };
  style?: CSSProperties;
};

let lastPlot: PlotProps | null = null;

vi.mock("react-plotly.js", () => ({
  default: function MockPlot(props: PlotProps) {
    lastPlot = props;
    return <div data-testid="plotly" />;
  },
}));

import Map2D from "./Map2D";

const ORIGIN = { lat: 32.08, lon: 34.78, alt_m: 50 };

const poseAt = (t: number): PoseResponse => ({
  t,
  origin: ORIGIN,
  drones: {
    "2": {
      present: true,
      synced: true,
      avatars: { ekf_ned: { e: 0, n: t * 10, u: 0 } },
    },
  },
});

const trajectory: TrajectoryResponse = {
  origin: ORIGIN,
  drones: {
    "2": {
      ekf_ned: {
        t: [0, 10],
        e: [0, 100],
        n: [0, 0],
        u: [0, 0],
      },
    },
  },
};

describe("Map2D height", () => {
  afterEach(() => {
    cleanup();
    lastPlot = null;
  });

  it("does not pin Plotly height so a data update cannot shrink the map", () => {
    const { rerender } = render(
      <Map2D
        pose={poseAt(0)}
        markers={[]}
        visibleDroneIds={["2"]}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(lastPlot?.layout?.height).toBeUndefined();
    expect(lastPlot?.layout?.autosize).toBe(true);
    expect(lastPlot?.style?.height).toBe("100%");

    rerender(
      <Map2D
        pose={poseAt(10)}
        trajectory={trajectory}
        markers={[]}
        visibleDroneIds={["2"]}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(lastPlot?.layout?.height).toBeUndefined();
    expect(lastPlot?.layout?.autosize).toBe(true);
    expect(lastPlot?.style?.height).toBe("100%");
  });
});
