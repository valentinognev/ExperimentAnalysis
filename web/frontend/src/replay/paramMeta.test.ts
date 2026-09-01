import { expect, it } from "vitest";
import {
  asNumber,
  bitOn,
  enumOptionValues,
  paramMeta,
  setBit,
} from "./paramMeta";

it("looks up QGC enum bitmask and boolean", () => {
  const hgt = paramMeta("EKF2_HGT_REF");
  expect(hgt?.kind).toBe("enum");
  if (hgt?.kind === "enum") {
    expect(hgt.options).toContainEqual({ value: 1, label: "GPS" });
  }
  const gps = paramMeta("EKF2_GPS_CTRL");
  expect(gps?.kind).toBe("bitmask");
  if (gps?.kind === "bitmask") {
    expect(gps.bits).toContainEqual({ index: 0, label: "Lon/lat" });
  }
  expect(paramMeta("EKF2_BARO_CTRL")).toEqual({ kind: "boolean" });
  expect(paramMeta("EKF2_RNG_NOISE")).toBeUndefined();
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
  if (hgt?.kind !== "enum") throw new Error("expected enum");
  expect(enumOptionValues(hgt)).toContain(0);
  expect(enumOptionValues(hgt)).toContain(1);
});
