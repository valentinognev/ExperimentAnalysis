import { expect, it } from "vitest";
import {
  asNumber,
  bitOn,
  enumOptionValues,
  paramKind,
  paramMeta,
  setBit,
} from "./paramMeta";

it("paramKind is undefined for unit-only meta", () => {
  expect(paramKind(paramMeta("EKF2_RNG_NOISE"))).toBeUndefined();
  expect(paramKind(paramMeta("EKF2_HGT_REF"))).toBe("enum");
});

it("looks up QGC enum bitmask and boolean", () => {
  const hgt = paramMeta("EKF2_HGT_REF");
  expect(paramKind(hgt)).toBe("enum");
  if (hgt && "options" in hgt) {
    expect(hgt.options).toContainEqual({ value: 1, label: "GPS" });
  }
  const gps = paramMeta("EKF2_GPS_CTRL");
  expect(paramKind(gps)).toBe("bitmask");
  if (gps && "bits" in gps) {
    expect(gps.bits).toContainEqual({ index: 0, label: "Lon/lat" });
  }
  expect(paramMeta("EKF2_BARO_CTRL")).toEqual({ kind: "boolean" });
  expect(paramMeta("EKF2_RNG_NOISE")).toEqual({ unit: "m" });
});

it("toggles bitmask bits", () => {
  expect(bitOn(7, 0)).toBe(true);
  expect(bitOn(7, 3)).toBe(false);
  expect(setBit(7, 0, false)).toBe(6);
  expect(setBit(6, 3, true)).toBe(14);
});

it("asNumber coerces strings", () => {
  expect(asNumber("3")).toBe(3);
  expect(asNumber("x")).toBe(0);
});

it("enumOptionValues lists codes", () => {
  const hgt = paramMeta("EKF2_HGT_REF");
  if (!hgt || paramKind(hgt) !== "enum" || !("options" in hgt)) {
    throw new Error("expected enum");
  }
  expect(enumOptionValues(hgt)).toContain(0);
  expect(enumOptionValues(hgt)).toContain(1);
});
