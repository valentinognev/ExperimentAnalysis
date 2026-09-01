// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  addPlot,
  removePlot,
  setPlotChannels,
  movePlot,
  flattenTopics,
  plotsForSlug,
  plotsOnSlugChange,
  topicsToChannelTree,
  filterChannelTree,
  channelLeaves,
  selectionAfterToggle,
  leafSelectionState,
  dashesForColors,
  cesiumDashPattern,
  type PlotDef,
  type ChannelNode,
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

describe("movePlot", () => {
  it("moves a plot up by swapping with the previous one", () => {
    const a = addPlot([], ["a"]);
    const b = addPlot(a, ["b"]);
    const next = movePlot(b, b[1].id, -1);
    expect(next.map((p) => p.id)).toEqual([b[1].id, b[0].id]);
  });

  it("moves a plot down by swapping with the next one", () => {
    const a = addPlot([], ["a"]);
    const b = addPlot(a, ["b"]);
    const next = movePlot(b, b[0].id, 1);
    expect(next.map((p) => p.id)).toEqual([b[1].id, b[0].id]);
  });

  it("does not move past the ends", () => {
    const a = addPlot([], ["a"]);
    const b = addPlot(a, ["b"]);
    expect(movePlot(b, b[0].id, -1)).toEqual(b);
    expect(movePlot(b, b[1].id, 1)).toEqual(b);
  });
});

describe("plotsOnSlugChange", () => {
  it("returns [] when slug changes A→B", () => {
    expect(plotsOnSlugChange("exp-a", "exp-b")).toEqual([]);
  });

  it("returns [] when slug changes to null", () => {
    expect(plotsOnSlugChange("exp-a", null)).toEqual([]);
  });

  it("returns [] when slug changes from null", () => {
    expect(plotsOnSlugChange(null, "exp-a")).toEqual([]);
  });

  it("returns null when slug unchanged", () => {
    expect(plotsOnSlugChange("exp-a", "exp-a")).toBeNull();
    expect(plotsOnSlugChange(null, null)).toBeNull();
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

const topics = {
  "2": {
    ulog: { vehicle_local_position: ["x", "y"] },
    sm: { sm_system_manager: ["state"] },
  },
  "4": {
    ulog: { vehicle_attitude: ["q[0]"] },
  },
};

it("topicsToChannelTree groups drone → source → topic → field", () => {
  const tree = topicsToChannelTree(topics);
  expect(tree.map((n) => n.label)).toEqual(["2", "4"]);
  expect(tree[0].children!.map((n) => n.label)).toEqual(["sm", "ulog"]);
  const ulog = tree[0].children!.find((n) => n.label === "ulog")!;
  const topic = ulog.children!.find((n) => n.label === "vehicle_local_position")!;
  expect(topic.children!.map((n) => n.id)).toEqual([
    "2.ulog.vehicle_local_position.x",
    "2.ulog.vehicle_local_position.y",
  ]);
  expect(topic.children![0].label).toBe("x");
  expect(topic.children![0].children).toBeFalsy();
});

it("topicsToChannelTree nests multi-instance .00/.01 under the shared topic", () => {
  const tree = topicsToChannelTree({
    "2": {
      ulog: {
        "estimator_aid_src_gnss_pos.00": ["timestamp", "innovation[0]"],
        "estimator_aid_src_gnss_pos.01": ["timestamp"],
        vehicle_local_position: ["x"],
      },
    },
  });
  const ulog = tree[0].children!.find((n) => n.label === "ulog")!;
  expect(ulog.children!.map((n) => n.label)).toEqual([
    "estimator_aid_src_gnss_pos",
    "vehicle_local_position",
  ]);
  const parent = ulog.children!.find((n) => n.label === "estimator_aid_src_gnss_pos")!;
  expect(parent.id).toBe("2.ulog.estimator_aid_src_gnss_pos");
  expect(parent.children!.map((n) => n.label)).toEqual(["00", "01"]);
  expect(parent.children!.map((n) => n.id)).toEqual([
    "2.ulog.estimator_aid_src_gnss_pos.00",
    "2.ulog.estimator_aid_src_gnss_pos.01",
  ]);
  expect(parent.children![0].children!.map((n) => n.id)).toEqual([
    "2.ulog.estimator_aid_src_gnss_pos.00.innovation[0]",
    "2.ulog.estimator_aid_src_gnss_pos.00.timestamp",
  ]);
  expect(parent.children![0].children![0].label).toBe("innovation[0]");
  expect(parent.children![0].children![0].children).toBeFalsy();
  expect(parent.children![1].children!.map((n) => n.id)).toEqual([
    "2.ulog.estimator_aid_src_gnss_pos.01.timestamp",
  ]);
  const plain = ulog.children!.find((n) => n.label === "vehicle_local_position")!;
  expect(plain.children!.map((n) => n.id)).toEqual(["2.ulog.vehicle_local_position.x"]);
});

it("filterChannelTree keeps only matching leaves and their ancestors", () => {
  const tree = topicsToChannelTree(topics);
  const filtered = filterChannelTree(tree, "local_pos");
  expect(filtered.map((n) => n.label)).toEqual(["2"]);
  const ids = filtered.flatMap((n) => n.children ?? []).flatMap(function leaves(n: ChannelNode): string[] {
    return n.children?.length ? n.children.flatMap(leaves) : [n.id];
  });
  expect(ids).toEqual([
    "2.ulog.vehicle_local_position.x",
    "2.ulog.vehicle_local_position.y",
  ]);
});

it("filterChannelTree is case-insensitive and matches dotted prefixes", () => {
  const tree = topicsToChannelTree(topics);
  const filtered = filterChannelTree(tree, "2.ULOG");
  const ids = filtered.flatMap(function leaves(n: ChannelNode): string[] {
    return n.children?.length ? n.children.flatMap(leaves) : [n.id];
  });
  expect(ids.sort()).toEqual([
    "2.ulog.vehicle_local_position.x",
    "2.ulog.vehicle_local_position.y",
  ]);
});

it("filterChannelTree empty query returns the original tree", () => {
  const tree = topicsToChannelTree(topics);
  expect(filterChannelTree(tree, "  ")).toBe(tree);
});

it("channelLeaves returns all descendant channel ids", () => {
  const tree = topicsToChannelTree(topics);
  expect(channelLeaves(tree[0]).sort()).toEqual([
    "2.sm.sm_system_manager.state",
    "2.ulog.vehicle_local_position.x",
    "2.ulog.vehicle_local_position.y",
  ]);
});

it("selectionAfterToggle selects all leaves when any are off, else clears them", () => {
  const tree = topicsToChannelTree(topics);
  const topic = tree[0].children!.find((n) => n.label === "ulog")!.children![0];
  const one = selectionAfterToggle(new Set(), topic);
  expect([...one].sort()).toEqual([
    "2.ulog.vehicle_local_position.x",
    "2.ulog.vehicle_local_position.y",
  ]);
  const none = selectionAfterToggle(one, topic);
  expect(none.size).toBe(0);
});

it("leafSelectionState reports none / some / all", () => {
  const tree = topicsToChannelTree(topics);
  const topic = tree[0].children!.find((n) => n.label === "ulog")!.children![0];
  expect(leafSelectionState(new Set(), topic)).toBe("none");
  expect(leafSelectionState(new Set(["2.ulog.vehicle_local_position.x"]), topic)).toBe("some");
  expect(
    leafSelectionState(
      new Set([
        "2.ulog.vehicle_local_position.x",
        "2.ulog.vehicle_local_position.y",
      ]),
      topic,
    ),
  ).toBe("all");
});

describe("dashesForColors", () => {
  it("keeps solid when every color is unique", () => {
    expect(dashesForColors(["#f97316", "#22d3ee", "#a78bfa"])).toEqual([
      "solid",
      "solid",
      "solid",
    ]);
  });

  it("assigns a distinct dash to each curve that shares a color", () => {
    expect(dashesForColors(["#f97316", "#22d3ee", "#f97316"])).toEqual([
      "solid",
      "solid",
      "dash",
    ]);
  });

  it("gives three same-color curves three distinct dashes", () => {
    const dashes = dashesForColors(["#aaa", "#aaa", "#aaa"]);
    expect(dashes).toEqual(["solid", "dash", "dot"]);
    expect(new Set(dashes).size).toBe(3);
  });

  it("stays unique past the named Plotly dashes", () => {
    const dashes = dashesForColors(Array(8).fill("#aaa"));
    expect(new Set(dashes).size).toBe(8);
    expect(dashes[0]).toBe("solid");
    expect(dashes[1]).toBe("dash");
    expect(dashes[6]).not.toBe(dashes[7]);
  });
});

describe("cesiumDashPattern", () => {
  it("returns undefined for a solid line", () => {
    expect(cesiumDashPattern("solid")).toBeUndefined();
  });

  it("returns distinct 16-bit patterns for named dashes", () => {
    const patterns = ["dash", "dot", "dashdot", "longdash", "longdashdot"].map(
      cesiumDashPattern,
    );
    expect(patterns.every((p) => p !== undefined)).toBe(true);
    expect(new Set(patterns).size).toBe(5);
  });
});
