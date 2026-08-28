// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";

type PlotTrace = {
  name?: string;
  customdata?: unknown;
  showlegend?: boolean;
  legendgroup?: string;
  mode?: string;
  marker?: {
    size?: number;
    color?: string;
    symbol?: string;
    line?: { color?: string; width?: number };
  };
  line?: { color?: string; dash?: string };
};

type PlotProps = {
  onClick?: (ev: unknown) => void;
  onHover?: (ev: unknown) => void;
  onUnhover?: () => void;
  config?: { doubleClick?: boolean | string };
  data?: PlotTrace[];
};

let lastPlot: PlotProps | null = null;

vi.mock("react-plotly.js", () => ({
  default: function MockPlot(props: PlotProps) {
    lastPlot = props;
    return <div data-testid="plotly" />;
  },
}));

import View3D from "./View3D";
import { droneColor } from "../droneColor";
import { MARKER_COLOR, MARKER_OUTLINE_COLOR } from "../markers";

const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];

function legendTraces(): PlotTrace[] {
  return (lastPlot?.data ?? []).filter((t) => t.showlegend !== false);
}

const ORIGIN = { lat: 32.08, lon: 34.78, alt_m: 50 };

function renderView(
  extra: Partial<ComponentProps<typeof View3D>> = {},
) {
  const onGroundClick = vi.fn();
  const onMarkerRemove = vi.fn();
  const result = render(
    <View3D
      drones={[]}
      origin={ORIGIN}
      markerPositions={[{ id: "m-1", e: 1, n: 2, u: 0 }]}
      onGroundClick={onGroundClick}
      onMarkerRemove={onMarkerRemove}
      {...extra}
    />,
  );
  return { ...result, onGroundClick, onMarkerRemove };
}

describe("View3D marker gestures", () => {
  afterEach(() => {
    cleanup();
    lastPlot = null;
  });

  it("disables Plotly double-click camera reset", () => {
    renderView();
    expect(lastPlot?.config?.doubleClick).toBe(false);
  });

  it("clips Plotly overflow so the legend cannot cover the 2D map", () => {
    const { container } = renderView();
    expect(container.firstChild).toHaveClass("overflow-hidden");
  });

  it("adds a marker only on double-click, not single click", () => {
    const { onGroundClick } = renderView();
    const ground = {
      points: [{ x: 0, y: 1 }],
      event: { detail: 1 },
    };
    lastPlot?.onClick?.(ground);
    expect(onGroundClick).not.toHaveBeenCalled();

    lastPlot?.onClick?.({ ...ground, event: { detail: 2 } });
    expect(onGroundClick).toHaveBeenCalledTimes(1);
    expect(onGroundClick.mock.calls[0][0].lat).toBeGreaterThan(ORIGIN.lat);
  });

  it("removes the hovered marker on right-click", () => {
    const { onMarkerRemove, container } = renderView();
    lastPlot?.onHover?.({
      points: [{ data: { name: "Markers" }, customdata: "m-1" }],
    });
    fireEvent.contextMenu(container.firstChild as HTMLElement);
    expect(onMarkerRemove).toHaveBeenCalledWith("m-1");
  });

  it("puts marker ids on the Markers trace as customdata", () => {
    renderView();
    const markersTrace = lastPlot?.data?.find(
      (t) => t.name === "Markers" && t.showlegend !== false,
    );
    expect(markersTrace?.customdata).toEqual(["m-1"]);
  });

  it("draws ground markers in a non-drone color with a black halo", () => {
    renderView();
    const markerTraces = (lastPlot?.data ?? []).filter((t) => t.name === "Markers");
    const fill = markerTraces.find((t) => t.showlegend !== false);
    const halo = markerTraces.find((t) => t.showlegend === false);
    expect(fill?.marker?.color).toBe(MARKER_COLOR);
    expect(fill?.marker?.symbol).toBe("diamond");
    expect(halo?.marker?.color).toBe(MARKER_OUTLINE_COLOR);
    expect(halo?.marker?.symbol).toBe("diamond");
    expect(halo?.marker?.size).toBeGreaterThan(fill?.marker?.size ?? 0);
  });
});

describe("View3D triad legend", () => {
  afterEach(() => {
    cleanup();
    lastPlot = null;
  });

  const ekf = {
    id: "2",
    label: "ekf_ned",
    pos: { e: 1, n: 2, u: 3 },
    attitude_q_xyzw: IDENTITY,
    style: "triad" as const,
  };

  it("lists a triad as one drone-colored body, named D2 ekf", () => {
    renderView({ drones: [ekf], markerPositions: [] });
    const shown = legendTraces();
    expect(shown.map((t) => t.name)).toEqual(["D2 ekf"]);
    expect(shown[0]?.mode).toBe("markers");
    expect(shown[0]?.marker?.color).toBe(droneColor("2"));
  });

  it("keeps RGB axes off the legend but in the same legendgroup as the body", () => {
    renderView({ drones: [ekf], markerPositions: [] });
    const grouped = (lastPlot?.data ?? []).filter(
      (t) => t.legendgroup === "D2 ekf",
    );
    expect(grouped).toHaveLength(5);
    expect(grouped.filter((t) => t.showlegend !== false)).toHaveLength(1);
    const axes = grouped.filter((t) => t.mode === "lines");
    expect(axes).toHaveLength(3);
    expect(axes.map((t) => t.line?.color).sort()).toEqual(["blue", "green", "red"]);
  });

  it("names a gps triad D2 gps", () => {
    renderView({
      drones: [{ ...ekf, label: "gps" }],
      markerPositions: [],
    });
    expect(legendTraces().map((t) => t.name)).toEqual(["D2 gps"]);
  });

  it("outlines the ekf body in black", () => {
    renderView({ drones: [ekf], markerPositions: [] });
    const body = legendTraces().find((t) => t.name === "D2 ekf");
    expect(body?.marker?.line).toEqual({ color: "black", width: 2 });
  });

  it("draws a black halo behind the ekf body so the ring shows in 3D", () => {
    renderView({ drones: [ekf], markerPositions: [] });
    const grouped = (lastPlot?.data ?? []).filter(
      (t) => t.legendgroup === "D2 ekf",
    );
    const markers = grouped.filter((t) => t.mode === "markers");
    expect(markers).toHaveLength(2);
    const halo = markers.find((t) => t.showlegend === false);
    const body = markers.find((t) => t.showlegend !== false);
    expect(halo?.marker?.color).toBe("black");
    expect(halo?.marker?.size).toBeGreaterThan(body?.marker?.size ?? 0);
  });

  it("does not outline the gps body", () => {
    renderView({
      drones: [{ ...ekf, label: "gps" }],
      markerPositions: [],
    });
    const body = legendTraces().find((t) => t.name === "D2 gps");
    expect(body?.marker?.line).toBeUndefined();
    const grouped = (lastPlot?.data ?? []).filter(
      (t) => t.legendgroup === "D2 gps",
    );
    expect(grouped.filter((t) => t.mode === "markers")).toHaveLength(1);
  });

  it("uses a distinct marker symbol per pose source", () => {
    renderView({
      drones: ["ekf_ned", "gps", "sm_ned", "sm_lla"].map((label) => ({
        ...ekf,
        label,
        style: "point" as const,
      })),
      markerPositions: [],
    });
    const bodies = legendTraces().filter((t) => t.mode === "markers");
    const symbols = bodies.map((t) => t.marker?.symbol ?? "");
    expect(symbols).toHaveLength(4);
    expect(new Set(symbols).size).toBe(4);
    expect(symbols).not.toContain("diamond");
  });

  it("keeps the trail as its own legend entry, not grouped with the body", () => {
    renderView({
      drones: [
        {
          ...ekf,
          trail: [
            { e: 0, n: 0, u: 0 },
            { e: 1, n: 1, u: 1 },
          ],
        },
      ],
      markerPositions: [],
    });
    expect(legendTraces().map((t) => t.name)).toEqual(["D2 ekf trail", "D2 ekf"]);
    const trail = lastPlot?.data?.find((t) => t.name === "D2 ekf trail");
    expect(trail?.legendgroup).not.toBe("D2 ekf");
  });

  it("hides the velocity arrow with the body via the same legendgroup", () => {
    renderView({
      drones: [
        {
          ...ekf,
          vectors: {
            velocity: { e: 1, n: 0, u: 0 },
            scale: 1,
            base: ekf.pos,
          },
        },
      ],
      markerPositions: [],
    });
    const velocity = lastPlot?.data?.find((t) => t.name === "velocity");
    expect(velocity?.showlegend).toBe(false);
    expect(velocity?.legendgroup).toBe("D2 ekf");
  });
});
