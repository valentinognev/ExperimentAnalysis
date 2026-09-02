// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mapFigure, mapLayout, stableMapTracks, type MapPoint } from "./map2d";

const samplePoints: MapPoint[] = [
  { lat: 47.37, lon: 8.54, name: "D2" },
  { lat: 47.371, lon: 8.541, name: "M1" },
];

describe("mapFigure", () => {
  it("layout map.style is carto-darkmatter by default", () => {
    const { layout } = mapFigure(samplePoints);
    expect(layout.map?.style).toBe("carto-darkmatter");
    expect(layout.legend?.font?.color).toBe("#e4e4e7");
  });

  it("uses night paper_bgcolor so the legend is not light text on white", () => {
    const { layout } = mapFigure(samplePoints);
    expect(layout.paper_bgcolor).toBe("#09090b");
    expect(layout.font?.color).toBe("#e4e4e7");
  });

  it("uses open-street-map tiles when skin is day", () => {
    const { layout } = mapFigure(samplePoints, [], { skin: "day" });
    expect(layout.map?.style).toBe("open-street-map");
    expect(layout.legend?.font?.color).toBe("#18181b");
  });

  it("uses day paper_bgcolor for the legend margin", () => {
    const { layout } = mapFigure(samplePoints, [], { skin: "day" });
    expect(layout.paper_bgcolor).toBe("#fafafa");
    expect(layout.font?.color).toBe("#18181b");
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
    const lats = data.flatMap((t) => (t as { lat?: number[] }).lat ?? []);
    const lons = data.flatMap((t) => (t as { lon?: number[] }).lon ?? []);
    expect(lats).toEqual(expect.arrayContaining(samplePoints.map((p) => p.lat)));
    expect(lons).toEqual(expect.arrayContaining(samplePoints.map((p) => p.lon)));
  });

  it("lists each drone marker in the legend, not only trajectories", () => {
    const { data } = mapFigure(
      [
        {
          lat: 32,
          lon: 35,
          name: "D2 ekf",
          color: "#f00",
          symbol: "circle",
          halo: true,
        },
        { lat: 32.1, lon: 35.1, name: "D2 gps", color: "#f00", symbol: "square" },
      ],
      [
        {
          lat: [32, 32.01],
          lon: [35, 35.01],
          name: "D2 ekf",
          color: "#f00",
        },
      ],
    );
    type T = { name?: string; mode?: string; showlegend?: boolean };
    const legend = data.filter((t) => (t as T).showlegend !== false) as T[];
    const names = legend.map((t) => t.name);
    expect(names).not.toContain("Map");
    expect(legend.some((t) => t.name === "D2 ekf" && t.mode?.includes("lines"))).toBe(
      true,
    );
    expect(
      legend.some((t) => t.name === "D2 ekf" && t.mode?.includes("markers")),
    ).toBe(true);
    expect(
      legend.some((t) => t.name === "D2 gps" && t.mode?.includes("markers")),
    ).toBe(true);
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

  it("shows ground marker names as labels on the map", () => {
    const { data } = mapFigure([
      { lat: 32, lon: 35, name: "D2 ekf", color: "#f00", symbol: "circle" },
      { lat: 32.1, lon: 35.1, name: "M1", color: "#FFFFFF", symbol: "diamond" },
    ]);
    type T = { mode?: string; text?: string[]; marker?: { symbol?: string } };
    const diamond = data.find((t) => (t as T).marker?.symbol === "diamond") as T;
    const circle = data.find((t) => (t as T).marker?.symbol === "circle") as T;
    expect(diamond?.mode).toContain("text");
    expect(diamond?.text).toEqual(["M1"]);
    expect(circle?.mode ?? "markers").not.toContain("text");
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

  it("draws sm ned as a hollow-square glyph and sm lla as an x glyph", () => {
    const { data } = mapFigure(
      [
        {
          lat: 32,
          lon: 35,
          name: "D2 sm ned",
          color: "#f00",
          symbol: "square-open",
        },
        {
          lat: 32.1,
          lon: 35.1,
          name: "D2 sm lla",
          color: "#f00",
          symbol: "x",
        },
      ],
      [],
    );
    type T = {
      name?: string;
      mode?: string;
      text?: string[];
      marker?: { symbol?: string };
    };
    const ned = data.find((t) => (t as T).name === "D2 sm ned") as T;
    const lla = data.find((t) => (t as T).name === "D2 sm lla") as T;
    expect(ned?.mode).toContain("text");
    expect(ned?.text).toEqual(["□"]);
    expect(ned?.marker?.symbol).not.toBe("square-stroked");
    expect(lla?.mode).toContain("text");
    expect(lla?.text).toEqual(["✕"]);
    expect(lla?.marker?.symbol).not.toBe("cross");
  });

  it("lists hollow-square and x pose markers in the legend", () => {
    const { data } = mapFigure(
      [
        {
          lat: 32,
          lon: 35,
          name: "D2 sm ned",
          color: "#f00",
          symbol: "square-open",
        },
        {
          lat: 32.1,
          lon: 35.1,
          name: "D2 sm lla",
          color: "#f00",
          symbol: "x",
        },
      ],
      [],
    );
    type T = { name?: string; showlegend?: boolean };
    const legend = data.filter((t) => (t as T).showlegend !== false) as T[];
    expect(legend.some((t) => t.name === "D2 sm ned")).toBe(true);
    expect(legend.some((t) => t.name === "D2 sm lla")).toBe(true);
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

  it("gives the legend enough top margin to wrap away from the modebar", () => {
    const { layout } = mapFigure(samplePoints);
    expect(layout.margin?.t ?? 0).toBeGreaterThanOrEqual(72);
    expect(layout.legend?.entrywidth).toBeGreaterThan(0);
    expect(layout.legend?.y).toBeLessThanOrEqual(1);
    expect(layout.legend?.x).toBe(0);
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

  it("gives same-color tracks distinct dashes and unique-color tracks a solid line", () => {
    const origin = { lat: 32, lon: 35, alt_m: 50 };
    const series = {
      t: [0, 1],
      e: [0, 10],
      n: [0, 0],
      u: [0, 0],
    };
    const poseAvatars = {
      ekf_ned: { e: 0, n: 0, u: 0 },
      gps: { e: 0, n: 0, u: 0 },
    };
    const sameColor = stableMapTracks(
      {
        drones: {
          "2": { ekf_ned: series, gps: series },
        },
      },
      origin,
      { "2": poseAvatars },
      {},
      ["2"],
      1,
    );
    expect(sameColor).toHaveLength(2);
    expect(sameColor[0].color).toBe(sameColor[1].color);
    expect(sameColor[0].dash).toBe("solid");
    expect(sameColor[1].dash).toBe("dash");

    const unique = stableMapTracks(
      {
        drones: {
          "2": { ekf_ned: series },
          "3": { ekf_ned: series },
        },
      },
      origin,
      {
        "2": { ekf_ned: { e: 0, n: 0, u: 0 } },
        "3": { ekf_ned: { e: 0, n: 0, u: 0 } },
      },
      {},
      ["2", "3"],
      1,
    );
    expect(unique.map((t) => t.dash)).toEqual(["solid", "solid"]);
  });

  it("replay track is not D1 red", () => {
    const origin = { lat: 32, lon: 35, alt_m: 50 };
    const tracks = stableMapTracks(
      {
        drones: {
          "2_r1": {
            ekf_ned: {
              t: [0, 1],
              e: [0, 10],
              n: [0, 0],
              u: [0, 0],
            },
          },
        },
      },
      origin,
      { "2_r1": { ekf_ned: { e: 0, n: 0, u: 0 } } },
      {},
      ["2_r1"],
      1,
    );
    expect(tracks).toHaveLength(1);
    expect(tracks[0].color).not.toBe("#FF2D00");
  });
});
