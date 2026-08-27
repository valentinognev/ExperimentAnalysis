// @vitest-environment node
import { describe, it, expect } from "vitest";
import { markerEntity } from "./cesiumMarkers";
import type { Marker } from "./markers";

describe("markerEntity", () => {
  it("returns lon/lat/alt for Cartesian3.fromDegrees", () => {
    const m: Marker = {
      id: "m-1",
      label: "M1",
      lat: 32.081,
      lon: 34.782,
      alt_m: 53.5,
    };
    const coords = markerEntity(m);
    expect(coords.lon).toBe(34.782);
    expect(coords.lat).toBe(32.081);
    expect(coords.alt_m).toBe(53.5);
  });
});
