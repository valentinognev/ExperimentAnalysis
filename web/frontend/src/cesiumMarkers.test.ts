// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  globePickToLla,
  markerEntity,
  markerEntityId,
  markerEntityStyle,
  markerIdFromEntityId,
} from "./cesiumMarkers";
import { MARKER_COLOR, MARKER_OUTLINE_COLOR, type Marker } from "./markers";

const ORIGIN = { lat: 32.08, lon: 34.78, alt_m: 50.0 };

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

describe("markerEntityStyle", () => {
  it("uses the shared non-drone marker fill and black outline", () => {
    expect(markerEntityStyle()).toEqual({
      color: MARKER_COLOR,
      outlineColor: MARKER_OUTLINE_COLOR,
    });
  });
});

describe("markerEntityId", () => {
  it("round-trips marker id and ignores other entities", () => {
    expect(markerIdFromEntityId(markerEntityId("m-1"))).toBe("m-1");
    expect(markerIdFromEntityId("drone-2")).toBeNull();
  });
});

describe("globePickToLla", () => {
  it("uses pick lat/lon and origin alt (Plotly u=0 ground)", () => {
    const lla = globePickToLla(32.081, 34.782, ORIGIN);
    expect(lla.lat).toBe(32.081);
    expect(lla.lon).toBe(34.782);
    expect(lla.alt_m).toBe(50.0);
  });
});
