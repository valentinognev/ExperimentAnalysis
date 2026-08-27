// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mapFigure, type MapPoint } from "./map2d";

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
});
