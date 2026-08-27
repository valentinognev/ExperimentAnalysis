import { describe, it, expect } from "vitest";
import { enuToLla, groundClickToLla, llaToEnu } from "./markers";

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
