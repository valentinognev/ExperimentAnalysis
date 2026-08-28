import { describe, it, expect } from "vitest";
import { AVATAR_KEYS } from "./avatars";
import { avatarMarkerStyle, avatarSymbolDataUri } from "./avatarMarker";
import { MARKERS_TRACE_NAME } from "./markers";

describe("avatarMarkerStyle", () => {
  it("gives each pose source a distinct 3D symbol and a distinct map symbol", () => {
    const symbols = AVATAR_KEYS.map((k) => avatarMarkerStyle(k).symbol);
    const mapSymbols = AVATAR_KEYS.map((k) => avatarMarkerStyle(k).mapSymbol);
    expect(new Set(symbols).size).toBe(AVATAR_KEYS.length);
    expect(new Set(mapSymbols).size).toBe(AVATAR_KEYS.length);
  });

  it("does not reuse the ground-marker diamond", () => {
    for (const key of AVATAR_KEYS) {
      expect(avatarMarkerStyle(key).symbol).not.toBe("diamond");
      expect(avatarMarkerStyle(key).mapSymbol).not.toBe("diamond");
    }
  });

  it("billboard images differ per 3D symbol", () => {
    const fill = "#ff0000";
    const uris = ["circle", "square", "square-open", "x"].map((s) =>
      avatarSymbolDataUri(s, fill, s === "circle"),
    );
    expect(new Set(uris).size).toBe(4);
  });

  it("keeps a black ring only on ekf", () => {
    expect(avatarMarkerStyle("ekf_ned").halo).toBe(true);
    expect(avatarMarkerStyle("ekf_ned").outline).toEqual({
      color: "black",
      width: 2,
    });
    expect(avatarMarkerStyle("gps").halo).toBeUndefined();
    expect(avatarMarkerStyle("sm_ned").outline).toBeUndefined();
    expect(avatarMarkerStyle("sm_lla").outline).toBeUndefined();
  });

  it("uses the same shape family on the map as in 3D", () => {
    expect(avatarMarkerStyle("ekf_ned")).toMatchObject({
      symbol: "circle",
      mapSymbol: "circle",
      halo: true,
    });
    expect(avatarMarkerStyle("gps")).toMatchObject({
      symbol: "square",
      mapSymbol: "square",
    });
    expect(avatarMarkerStyle("sm_ned")).toMatchObject({
      symbol: "square-open",
      mapSymbol: "square-stroked",
    });
    expect(avatarMarkerStyle("sm_lla")).toMatchObject({
      symbol: "x",
      mapSymbol: "cross",
    });
  });

  it("keeps the 3D x smaller than the ekf circle", () => {
    expect(avatarMarkerStyle("sm_lla").size).toBeLessThan(
      avatarMarkerStyle("ekf_ned").size,
    );
  });
});

describe("ground marker name is not an avatar key", () => {
  it("Markers label stays distinct from avatar legend names", () => {
    expect(MARKERS_TRACE_NAME).toBe("Markers");
  });
});
