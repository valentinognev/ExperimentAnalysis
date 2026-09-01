// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

type PlotTrace = {
  name?: string;
  line?: { color?: string; width?: number; dash?: string };
};

type PlotProps = {
  data?: PlotTrace[];
  layout?: {
    margin?: { l?: number; r?: number; t?: number; b?: number };
    xaxis?: {
      range?: [number, number];
      autorange?: boolean;
      automargin?: boolean;
      gridcolor?: string;
    };
    yaxis?: { gridcolor?: string; automargin?: boolean };
    paper_bgcolor?: string;
    plot_bgcolor?: string;
    shapes?: Array<{ line?: { color?: string } }>;
  };
};

let lastPlot: PlotProps | null = null;

vi.mock("react-plotly.js", () => ({
  default: function MockPlot(props: PlotProps) {
    lastPlot = props;
    return <div data-testid="plotly" />;
  },
}));

vi.mock("../api", () => ({
  getSeries: vi.fn(),
}));

import { getSeries } from "../api";
import { PLOT_TIME_MARGIN } from "../channelPlotAxis";
import { droneColor } from "../droneColor";
import ChannelPlot from "./ChannelPlot";

beforeEach(() => {
  lastPlot = null;
  vi.mocked(getSeries).mockResolvedValue({
    "2.ulog.vehicle_local_position.x": { t: [0, 1], y: [1, 2] },
    "2.ulog.vehicle_local_position.y": { t: [0, 1], y: [3, 4] },
    "2.ulog.vehicle_local_position.z": { t: [0, 1], y: [5, 6] },
    "3.ulog.vehicle_local_position.x": { t: [0, 1], y: [7, 8] },
    "3.ulog.vehicle_local_position.y": { t: [0, 1], y: [9, 10] },
    "3.ulog.vehicle_local_position.z": { t: [0, 1], y: [11, 12] },
  });
});

afterEach(() => cleanup());

function tracesByName(): Map<string, PlotTrace> {
  return new Map((lastPlot?.data ?? []).map((t) => [t.name ?? "", t]));
}

describe("ChannelPlot NED traces", () => {
  it("keeps drone color but distinguishes x/y/z by dash and width", async () => {
    render(
      <ChannelPlot slug="exp" visibleDroneIds={["2", "3"]} t={0} tMax={1} />,
    );

    await waitFor(() => {
      expect(tracesByName().size).toBe(6);
    });

    const traces = tracesByName();
    const d2x = traces.get("D2 x");
    const d2y = traces.get("D2 y");
    const d2z = traces.get("D2 z");
    const d3x = traces.get("D3 x");

    expect(d2x?.line?.color).toBe(droneColor("2"));
    expect(d2y?.line?.color).toBe(droneColor("2"));
    expect(d2z?.line?.color).toBe(droneColor("2"));
    expect(d3x?.line?.color).toBe(droneColor("3"));

    expect(d2x?.line).toMatchObject({ dash: "solid", width: 2.5 });
    expect(d2y?.line).toMatchObject({ dash: "dash", width: 1.5 });
    expect(d2z?.line).toMatchObject({ dash: "dot", width: 1 });

    expect(d3x?.line).toMatchObject({ dash: "solid", width: 2.5 });
    expect(traces.get("D3 y")?.line).toMatchObject({ dash: "dash", width: 1.5 });
    expect(traces.get("D3 z")?.line).toMatchObject({ dash: "dot", width: 1 });

    const styles = [d2x, d2y, d2z].map((t) => `${t?.line?.dash}:${t?.line?.width}`);
    expect(new Set(styles).size).toBe(3);
  });

  it("replay NED traces are not D1 red", async () => {
    vi.mocked(getSeries).mockResolvedValue({
      "2_r1.ulog.vehicle_local_position.x": { t: [0, 1], y: [1, 2] },
      "2_r1.ulog.vehicle_local_position.y": { t: [0, 1], y: [3, 4] },
      "2_r1.ulog.vehicle_local_position.z": { t: [0, 1], y: [5, 6] },
    });
    render(
      <ChannelPlot slug="exp" visibleDroneIds={["2_r1"]} t={0} tMax={1} />,
    );
    await waitFor(() => {
      expect(tracesByName().size).toBe(3);
    });
    expect(tracesByName().get("D2_r1 x")?.line?.color).not.toBe("#FF2D00");
  });

  it("pins x-axis to experiment duration so stacked panes share ticks", async () => {
    render(
      <ChannelPlot slug="exp" visibleDroneIds={["2"]} t={0} tMax={160} />,
    );

    await waitFor(() => {
      expect(lastPlot?.layout?.xaxis?.range).toEqual([0, 160]);
    });
    expect(lastPlot?.layout?.xaxis?.autorange).toBe(false);
    expect(lastPlot?.layout?.xaxis?.automargin).toBe(false);
    expect(lastPlot?.layout?.yaxis?.automargin).toBe(false);
    expect(lastPlot?.layout?.margin).toEqual(PLOT_TIME_MARGIN);
    expect(lastPlot?.layout?.paper_bgcolor).toBe("#09090b");
    expect(lastPlot?.layout?.shapes?.[0]?.line?.color).toBe("#fafafa");
  });

  it("uses day paper when skin is day", async () => {
    render(
      <ChannelPlot
        slug="exp"
        visibleDroneIds={["2"]}
        t={0}
        tMax={160}
        skin="day"
      />,
    );

    await waitFor(() => {
      expect(lastPlot?.layout?.paper_bgcolor).toBe("#fafafa");
    });
    expect(lastPlot?.layout?.shapes?.[0]?.line?.color).toBe("#18181b");
    expect(lastPlot?.layout?.xaxis?.gridcolor).toBe("#d4d4d8");
    expect(lastPlot?.layout?.yaxis?.gridcolor).toBe("#d4d4d8");
  });
});
