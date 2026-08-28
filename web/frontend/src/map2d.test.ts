// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mapFigure, mapLayout, stableMapTracks, type MapPoint } from "./map2d";

const samplePoints: MapPoint[] = [
  { lat: 47.37, lon: 8.54, name: "D2" },
  { lat: 47.371, lon: 8.541, name: "M1" },
];

describe("mapFigure", () => {
  it("layout map.style is open-street-map", () => {
    const { layout } = mapFigure(samplePoints);
    expect(layout.map?.style).toBe("open-street-map");
  });

  it("trace type is scattermap not scattermapbox", () => {
    const { data } = mapFigure(samplePoints);
    expect(data.length).toBeGreaterThan(0);
    for (const trace of data) {
      expect(trace.type).toBe("scattermap");
      expect(trace.type).not.toBe("scattermapbox");
    }
  });

  it("traces include lat and lon arrays", () => {
    const { data } = mapFigure(samplePoints);
    const main = data[0] as { lat?: number[]; lon?: number[] };
    expect(main.lat).toEqual(samplePoints.map((p) => p.lat));
    expect(main.lon).toEqual(samplePoints.map((p) => p.lon));
  });

  it("draws each track as a scattermap line", () => {
    const { data } = mapFigure(samplePoints, [
      {
        lat: [47.37, 47.371],
        lon: [8.54, 8.541],
        name: "D2 ekf",
        color: "#f00",
        dash: "dash",
      },
    ]);
    const line = data.find((t) => t.name === "D2 ekf") as {
      type?: string;
      mode?: string;
      lat?: number[];
      lon?: number[];
      line?: { dash?: string; color?: string };
    };
    expect(line?.type).toBe("scattermap");
    expect(line?.mode).toContain("lines");
    expect(line?.lat).toEqual([47.37, 47.371]);
    expect(line?.lon).toEqual([8.54, 8.541]);
    expect(line?.line?.dash).toBe("dash");
  });

  it("draws current pose points with per-source symbols", () => {
    const { data } = mapFigure(
      [
        { lat: 32, lon: 35, name: "D2 ekf", color: "#f00", symbol: "circle" },
        { lat: 32.1, lon: 35.1, name: "D2 gps", color: "#f00", symbol: "square" },
      ],
      [],
    );
    const symbols = data.flatMap((t) => {
      const s = (t as { marker?: { symbol?: string | string[] } }).marker?.symbol;
      return s === undefined ? [] : Array.isArray(s) ? s : [s];
    });
    expect(symbols).toContain("circle");
    expect(symbols).toContain("square");
  });

  it("draws a black ring behind ekf circles like 3D", () => {
    const { data } = mapFigure(
      [
        {
          lat: 32,
          lon: 35,
          name: "D2 ekf",
          color: "#0ea5e9",
          symbol: "circle",
          halo: true,
        },
      ],
      [],
    );
    type Mk = { showlegend?: boolean; marker?: { color?: unknown; size?: number; symbol?: string } };
    const markerColor = (c: unknown): string[] =>
      c === undefined ? [] : Array.isArray(c) ? c.map(String) : [String(c)];
    const halo = data.find(
      (t) =>
        (t as Mk).showlegend === false &&
        markerColor((t as Mk).marker?.color).includes("black"),
    ) as Mk;
    const fill = data.find((t) =>
      markerColor((t as Mk).marker?.color).includes("#0ea5e9"),
    ) as Mk;
    expect(halo?.marker?.symbol).toBe("circle");
    expect(fill?.marker?.symbol).toBe("circle");
    expect(halo?.marker?.size ?? 0).toBeGreaterThan(fill?.marker?.size ?? 0);
  });

  it("keeps the legend inside the map so it cannot cover the 3D plot", () => {
    const { layout } = mapFigure(samplePoints);
    expect(layout.legend?.y).toBeLessThanOrEqual(1);
    expect((layout.margin?.t ?? 0) >= 24).toBe(true);
  });

  it("fills the host instead of pinning a pixel height", () => {
    const { layout } = mapFigure(samplePoints);
    expect(layout.autosize).toBe(true);
    expect(layout.height).toBeUndefined();
  });

  it("keeps map camera/tiles across T via uirevision", () => {
    const a = mapLayout({ datarevision: 1 });
    const b = mapLayout({ datarevision: 2 });
    expect(a.uirevision).toBe("map");
    expect(b.uirevision).toBe(a.uirevision);
    expect(a.map && "uirevision" in a.map ? a.map.uirevision : undefined).toBe(
      "map",
    );
    expect(a.datarevision).toBe(1);
    expect(b.datarevision).toBe(2);
  });

  it("map tracks keep only samples at or before T", () => {
    const origin = { lat: 32, lon: 35, alt_m: 50 };
    const trajectory = {
      origin,
      drones: {
        "2": {
          ekf_ned: {
            t: [0, 1, 2],
            e: [0, 10, 20],
            n: [0, 0, 0],
            u: [0, 0, 0],
          },
        },
      },
    };
    const poseAvatars = { ekf_ned: { e: 0, n: 0, u: 0 } };
    const tracks = stableMapTracks(
      trajectory,
      origin,
      { "2": poseAvatars },
      {},
      ["2"],
      1,
    );
    expect(tracks).toHaveLength(1);
    expect(tracks[0].lat).toHaveLength(2);
    expect(tracks[0].lon).toHaveLength(2);
  });

  it("map tracks drop future samples when T moves backward", () => {
    const origin = { lat: 32, lon: 35, alt_m: 50 };
    const trajectory = {
      origin,
      drones: {
        "2": {
          ekf_ned: {
            t: [0, 1, 2],
            e: [0, 10, 20],
            n: [0, 0, 0],
            u: [0, 0, 0],
          },
        },
      },
    };
    const poseAvatars = { ekf_ned: { e: 0, n: 0, u: 0 } };
    const atEnd = stableMapTracks(
      trajectory,
      origin,
      { "2": poseAvatars },
      {},
      ["2"],
      2,
    );
    const atStart = stableMapTracks(
      trajectory,
      origin,
      { "2": poseAvatars },
      {},
      ["2"],
      0,
    );
    expect(atEnd[0].lat).toHaveLength(3);
    expect(atStart[0].lat).toHaveLength(1);
  });
});
