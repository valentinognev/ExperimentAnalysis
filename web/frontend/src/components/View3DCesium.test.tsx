// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

vi.mock("cesium/Build/Cesium/Widgets/widgets.css", () => ({}));
vi.mock("react-plotly.js", () => ({
  default: function MockPlot() {
    return null;
  },
}));

import { updateEntities } from "./View3DCesium";

describe("View3DCesium replay color", () => {
  it("replay billboard is not D1 red", () => {
    const added: { billboard?: { image?: string } }[] = [];
    const viewer = {
      entities: {
        removeAll: () => {},
        add: (e: { billboard?: { image?: string } }) => {
          added.push(e);
          return e;
        },
      },
    };
    const Cesium = {
      Cartesian3: { fromDegrees: () => ({}) },
      Color: {
        fromCssColorString: (c: string) => c,
        WHITE: "#fff",
        BLACK: "#000",
      },
      LabelStyle: { FILL_AND_OUTLINE: 2 },
      VerticalOrigin: { BOTTOM: 1 },
      Cartesian2: class {
        constructor(_x: number, _y: number) {}
      },
    };
    updateEntities(
      viewer as never,
      Cesium as never,
      [
        {
          id: "2_r1",
          pos: { e: 0, n: 0, u: 0 },
          label: "ekf_ned",
          style: "point",
        },
      ],
      [],
      { lat: 32, lon: 35, alt_m: 50 },
      1,
    );
    const image = added.find((e) => e.billboard)?.billboard?.image ?? "";
    expect(image).not.toContain("#FF2D00");
  });
});
