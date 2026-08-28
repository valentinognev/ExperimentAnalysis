import { describe, it, expect } from "vitest";
import { DRONE_COLORS } from "./droneColor";
import {
  enuToLla,
  groundClickToLla,
  isPlotDoubleClick,
  llaToEnu,
  MARKER_COLOR,
  MARKER_OUTLINE_COLOR,
  markerIdFromPlotPick,
} from "./markers";

function parseHexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbDistance(a: string, b: string): number {
  const [ar, ag, ab] = parseHexRgb(a);
  const [br, bg, bb] = parseHexRgb(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

const ORIGIN = { lat: 32.08, lon: 34.78, alt_m: 50.0 };

describe("groundClickToLla", () => {
  it("converts E/N click at ground to LLA", () => {
    const lla = groundClickToLla({ points: [{ x: 0, y: 1 }] }, ORIGIN);
    expect(lla).not.toBeNull();
    const { e, n, u } = llaToEnu(
      lla!.lat,
      lla!.lon,
      lla!.alt_m,
      ORIGIN.lat,
      ORIGIN.lon,
      ORIGIN.alt_m,
    );
    expect(n).toBeCloseTo(1, 5);
    expect(e).toBeCloseTo(0, 5);
    expect(u).toBeCloseTo(0, 5);
  });

  it("returns null when click has no point", () => {
    expect(groundClickToLla({}, ORIGIN)).toBeNull();
    expect(groundClickToLla({ points: [{}] }, ORIGIN)).toBeNull();
  });
});

describe("isPlotDoubleClick", () => {
  it("is true when native detail is 2", () => {
    expect(isPlotDoubleClick({ detail: 2 }, 1000, null)).toBe(true);
  });

  it("is false on a first click", () => {
    expect(isPlotDoubleClick({ detail: 1 }, 1000, null)).toBe(false);
  });

  it("is true when a second click arrives within the double-click window", () => {
    expect(isPlotDoubleClick({ detail: 1 }, 1250, 1000)).toBe(true);
  });

  it("is false when clicks are farther apart than the window", () => {
    expect(isPlotDoubleClick({ detail: 1 }, 1600, 1000)).toBe(false);
  });
});

describe("markerIdFromPlotPick", () => {
  it("returns customdata when the pick is the Markers trace", () => {
    expect(
      markerIdFromPlotPick({
        points: [{ data: { name: "Markers" }, customdata: "m-1" }],
      }),
    ).toBe("m-1");
  });

  it("returns null for ground or drone picks", () => {
    expect(
      markerIdFromPlotPick({
        points: [{ data: { name: "ground" }, customdata: "m-1" }],
      }),
    ).toBeNull();
    expect(markerIdFromPlotPick({})).toBeNull();
  });
});

describe("enuToLla roundtrip", () => {
  it("inverts llaToEnu", () => {
    const lat = 32.081;
    const lon = 34.782;
    const alt_m = 53.5;
    const { e, n, u } = llaToEnu(
      lat,
      lon,
      alt_m,
      ORIGIN.lat,
      ORIGIN.lon,
      ORIGIN.alt_m,
    );
    const back = enuToLla(e, n, u, ORIGIN.lat, ORIGIN.lon, ORIGIN.alt_m);
    expect(back.lat).toBeCloseTo(lat, 9);
    expect(back.lon).toBeCloseTo(lon, 9);
    expect(back.alt_m).toBeCloseTo(alt_m, 6);
  });
});

describe("MARKER_COLOR", () => {
  it("is not similar to any drone color", () => {
    for (const drone of DRONE_COLORS) {
      expect(rgbDistance(MARKER_COLOR, drone)).toBeGreaterThan(80);
    }
  });

  it("uses a black outline so the fill stays readable on dark and light scenes", () => {
    expect(rgbDistance(MARKER_OUTLINE_COLOR, MARKER_COLOR)).toBeGreaterThan(80);
    expect(MARKER_OUTLINE_COLOR.toLowerCase()).toBe("#000000");
  });
});
