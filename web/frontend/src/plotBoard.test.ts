// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  addPlot,
  removePlot,
  setPlotChannels,
  flattenTopics,
  plotsForSlug,
  type PlotDef,
} from "./plotBoard";

describe("addPlot", () => {
  it("empty → one plot with given channels and unique id", () => {
    const channels = ["2.ulog.vehicle_local_position.x"];
    const plots = addPlot([], channels);

    expect(plots).toHaveLength(1);
    expect(plots[0].channels).toEqual(channels);
    expect(plots[0].id).toBeTruthy();
    expect(typeof plots[0].id).toBe("string");
  });

  it("twice → two plots with different ids", () => {
    const a = addPlot([], ["2.ulog.vehicle_local_position.x"]);
    const b = addPlot(a, ["2.ulog.vehicle_local_position.y"]);

    expect(b).toHaveLength(2);
    expect(b[0].id).not.toBe(b[1].id);
    expect(b[1].channels).toEqual(["2.ulog.vehicle_local_position.y"]);
  });
});

describe("removePlot", () => {
  it("removes plot by id", () => {
    const plots = addPlot([], ["a.b.c.d"]);
    const id = plots[0].id;
    expect(removePlot(plots, id)).toEqual([]);
    expect(removePlot(plots, "missing")).toEqual(plots);
  });
});

describe("setPlotChannels", () => {
  it("updates channels for matching id", () => {
    const plots = addPlot([], ["a.b.c.d"]);
    const id = plots[0].id;
    const next = setPlotChannels(plots, id, ["x.y.z.w"]);
    expect(next[0].channels).toEqual(["x.y.z.w"]);
    expect(next[0].id).toBe(id);
  });
});

describe("plotsForSlug", () => {
  it("returns empty when slug changes", () => {
    const plots: PlotDef[] = addPlot([], ["a.b.c.d"]);
    expect(plotsForSlug("exp-a", "exp-b", plots)).toEqual([]);
  });

  it("keeps plots when slug unchanged", () => {
    const plots: PlotDef[] = addPlot([], ["a.b.c.d"]);
    expect(plotsForSlug("exp-a", "exp-a", plots)).toBe(plots);
  });
});

describe("flattenTopics", () => {
  it("flattens drone → source → topic → fields to channel ids", () => {
    const tree = {
      "2": {
        ulog: {
          vehicle_local_position: ["x", "y", "z"],
        },
      },
    };
    expect(flattenTopics(tree)).toEqual([
      "2.ulog.vehicle_local_position.x",
      "2.ulog.vehicle_local_position.y",
      "2.ulog.vehicle_local_position.z",
    ]);
  });
});
