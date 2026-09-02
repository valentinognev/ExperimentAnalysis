// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

vi.mock("react-plotly.js", () => ({
  default: function MockPlot() {
    return <div data-testid="plotly" />;
  },
}));

vi.mock("./api", () => ({
  listExperiments: vi.fn(),
  openExperiment: vi.fn(),
  getDuration: vi.fn(),
  getPose: vi.fn(),
  getTrajectory: vi.fn(),
  getSeries: vi.fn(),
  getTopics: vi.fn(),
  patchManifest: vi.fn(),
  patchMarkers: vi.fn(),
  createExperiment: vi.fn(),
  setDroneCount: vi.fn(),
  inspectReplay: vi.fn(),
  startReplay: vi.fn(),
  getReplay: vi.fn(),
  stopReplay: vi.fn(),
  getReplaySeries: vi.fn(),
  deleteReplayDrone: vi.fn(),
}));

import {
  listExperiments,
  openExperiment,
  getDuration,
  getPose,
  getTrajectory,
  getSeries,
  getTopics,
  patchManifest,
  patchMarkers,
  deleteReplayDrone,
  inspectReplay,
  startReplay,
  getReplay,
  getReplaySeries,
} from "./api";
import App from "./App";
import { SkinProvider } from "./SkinContext";

function follows(earlier: Node, later: Node): boolean {
  return Boolean(
    earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe("App analysis layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listExperiments).mockResolvedValue([
      { slug: "foo", name: "Foo", drone_ids: ["1"], missing: [] },
    ]);
    vi.mocked(openExperiment).mockResolvedValue({
      slug: "foo",
      manifest: { name: "Foo", drones: {} },
    });
    vi.mocked(getDuration).mockResolvedValue({ t_max_s: 12 });
    vi.mocked(getPose).mockResolvedValue({
      t: 0,
      origin: { lat: 0, lon: 0, alt_m: 0 },
      drones: {},
    });
    vi.mocked(getTrajectory).mockResolvedValue({
      origin: { lat: 0, lon: 0, alt_m: 0 },
      drones: {},
    });
    vi.mocked(getSeries).mockResolvedValue({});
    vi.mocked(getTopics).mockResolvedValue({});
    vi.mocked(patchManifest).mockResolvedValue({
      slug: "foo",
      manifest: {},
    });
    vi.mocked(patchMarkers).mockResolvedValue({
      slug: "foo",
      manifest: {},
    });
    vi.mocked(getReplaySeries).mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    delete document.documentElement.dataset.skin;
  });

  function renderApp() {
    return render(
      <SkinProvider>
        <App />
      </SkinProvider>,
    );
  }

  async function openAnalysis() {
    const user = userEvent.setup();
    renderApp();
    const picker = screen.getByRole("combobox", { name: "Experiment" });
    await waitFor(() => {
      expect(within(picker).getByRole("option", { name: "foo" })).toBeInTheDocument();
    });
    await user.selectOptions(picker, "foo");
    await user.click(screen.getByRole("tab", { name: "Analysis" }));
    const panel = await screen.findByRole("tabpanel", { name: /analysis/i });
    await waitFor(() => {
      expect(within(panel).getByRole("button", { name: "Play" })).toBeInTheDocument();
    });
    return panel;
  }

  it("places the play bar in Analysis just below the 3D plot", async () => {
    const panel = await openAnalysis();
    const engine = within(panel).getByText("3D engine");
    const play = within(panel).getByRole("button", { name: "Play" });
    const addPlot = within(panel).getByRole("button", { name: "Add plot" });

    expect(follows(engine, play)).toBe(true);
    expect(follows(play, addPlot)).toBe(true);
  });

  it("keeps play and the scrubber out of the 3D card, above the plots", async () => {
    const panel = await openAnalysis();
    const engine = within(panel).getByText("3D engine");
    const play = within(panel).getByRole("button", { name: "Play" });
    const slider = within(panel).getByRole("slider", { name: "Time scrubber" });
    const addPlot = within(panel).getByRole("button", { name: "Add plot" });
    const threeDCard = engine.closest(".overflow-hidden");

    expect(threeDCard?.contains(play)).toBe(false);
    expect(threeDCard?.contains(slider)).toBe(false);
    expect(follows(engine, play)).toBe(true);
    expect(follows(play, slider)).toBe(true);
    expect(follows(slider, addPlot)).toBe(true);
  });

  it("shows Night and Day skin buttons", () => {
    renderApp();
    const group = screen.getByRole("group", { name: "Skin" });
    expect(within(group).getByRole("button", { name: "Night" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Day" })).toBeInTheDocument();
  });

  it('clicking Day sets document.documentElement.dataset.skin to "day"', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Day" }));
    expect(document.documentElement.dataset.skin).toBe("day");
  });

  it("does not persist skin on the experiment manifest", async () => {
    const user = userEvent.setup();
    await openAnalysis();
    await user.click(screen.getByRole("button", { name: "Day" }));
    await new Promise((r) => setTimeout(r, 400));
    for (const [, body] of vi.mocked(patchManifest).mock.calls) {
      expect(JSON.stringify(body ?? {})).not.toMatch(/"skin"/);
    }
  });

  it("shows D2_r1 on Sources when the manifest has a replay drone", async () => {
    vi.mocked(listExperiments).mockResolvedValue([
      { slug: "foo", name: "Foo", drone_ids: ["1", "2", "2_r1"], missing: [] },
    ]);
    vi.mocked(openExperiment).mockResolvedValue({
      slug: "foo",
      manifest: {
        name: "Foo",
        drones: [
          { id: 1 },
          { id: 2, sources: { ulg: ["raw/drone_2/d2.ulg"] } },
          {
            id: "2_r1",
            kind: "replay",
            sources: { ulg: ["raw/drone_2_r1/replayed_r1.ulg"] },
          },
        ],
      },
    });
    const user = userEvent.setup();
    renderApp();
    const picker = screen.getByRole("combobox", { name: "Experiment" });
    await waitFor(() => {
      expect(within(picker).getByRole("option", { name: "foo" })).toBeInTheDocument();
    });
    await user.selectOptions(picker, "foo");
    await waitFor(() => {
      expect(screen.getByText("D2_r1")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Delete D2_r1" })).toBeInTheDocument();
  });

  it("removes D2_r1 from Sources after Delete and refresh", async () => {
    const withReplay = {
      slug: "foo",
      manifest: {
        name: "Foo",
        drones: [
          { id: 1 },
          { id: 2, sources: { ulg: ["raw/drone_2/d2.ulg"] } },
          {
            id: "2_r1",
            kind: "replay",
            sources: { ulg: ["raw/drone_2_r1/replayed_r1.ulg"] },
          },
        ],
        ui: { visible_drone_ids: [1, 2, "2_r1"], avatars: { "2_r1": ["ekf_ned"] } },
      },
    };
    const withoutReplay = {
      slug: "foo",
      manifest: {
        name: "Foo",
        drones: [
          { id: 1 },
          { id: 2, sources: { ulg: ["raw/drone_2/d2.ulg"] } },
        ],
        ui: { visible_drone_ids: [1, 2], avatars: {} },
      },
    };
    vi.mocked(listExperiments).mockResolvedValue([
      { slug: "foo", name: "Foo", drone_ids: ["1", "2", "2_r1"], missing: [] },
    ]);
    vi.mocked(openExperiment).mockResolvedValue(withReplay);
    vi.mocked(getPose).mockResolvedValue({
      t: 0,
      origin: { lat: 0, lon: 0, alt_m: 0 },
      drones: {
        "1": { present: false, synced: true },
        "2": { present: true, synced: true },
        "2_r1": { present: true, synced: true },
      },
    });
    vi.mocked(deleteReplayDrone).mockImplementation(async () => {
      vi.mocked(listExperiments).mockResolvedValue([
        { slug: "foo", name: "Foo", drone_ids: ["1", "2"], missing: [] },
      ]);
      vi.mocked(openExperiment).mockResolvedValue(withoutReplay);
      vi.mocked(getPose).mockResolvedValue({
        t: 0,
        origin: { lat: 0, lon: 0, alt_m: 0 },
        drones: {
          "1": { present: false, synced: true },
          "2": { present: true, synced: true },
        },
      });
      return withoutReplay;
    });
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    const user = userEvent.setup();
    renderApp();
    const picker = screen.getByRole("combobox", { name: "Experiment" });
    await waitFor(() => {
      expect(within(picker).getByRole("option", { name: "foo" })).toBeInTheDocument();
    });
    await user.selectOptions(picker, "foo");
    await waitFor(() => {
      expect(screen.getByText("D2_r1")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Delete D2_r1" }));

    await waitFor(() => {
      expect(deleteReplayDrone).toHaveBeenCalledWith("foo", "2_r1");
      expect(screen.queryByText("D2_r1")).not.toBeInTheDocument();
    });
    expect(screen.getByText("D2")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("drops plot panes for a deleted replay id on refresh", async () => {
    const withReplay = {
      slug: "foo",
      manifest: {
        name: "Foo",
        drones: [
          { id: 1 },
          { id: 2, sources: { ulg: ["raw/drone_2/d2.ulg"] } },
          {
            id: "2_r1",
            kind: "replay",
            sources: { ulg: ["raw/drone_2_r1/replayed_r1.ulg"] },
          },
        ],
        ui: {
          visible_drone_ids: [1, 2, "2_r1"],
          plots: [
            { id: "keep", channels: ["2.ulog.vehicle_local_position.x"] },
            { id: "gone", channels: ["2_r1.ulog.vehicle_local_position.x"] },
          ],
        },
      },
    };
    const withoutReplay = {
      slug: "foo",
      manifest: {
        name: "Foo",
        drones: [
          { id: 1 },
          { id: 2, sources: { ulg: ["raw/drone_2/d2.ulg"] } },
        ],
        ui: {
          visible_drone_ids: [1, 2],
          plots: [{ id: "keep", channels: ["2.ulog.vehicle_local_position.x"] }],
        },
      },
    };
    vi.mocked(listExperiments).mockResolvedValue([
      { slug: "foo", name: "Foo", drone_ids: ["1", "2", "2_r1"], missing: [] },
    ]);
    vi.mocked(openExperiment).mockResolvedValue(withReplay);
    vi.mocked(deleteReplayDrone).mockImplementation(async () => {
      vi.mocked(listExperiments).mockResolvedValue([
        { slug: "foo", name: "Foo", drone_ids: ["1", "2"], missing: [] },
      ]);
      vi.mocked(openExperiment).mockResolvedValue(withoutReplay);
      return withoutReplay;
    });
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    const user = userEvent.setup();
    renderApp();
    const picker = screen.getByRole("combobox", { name: "Experiment" });
    await waitFor(() => {
      expect(within(picker).getByRole("option", { name: "foo" })).toBeInTheDocument();
    });
    await user.selectOptions(picker, "foo");
    await waitFor(() => {
      expect(screen.getByText("D2_r1")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Delete D2_r1" }));
    await waitFor(() => {
      expect(deleteReplayDrone).toHaveBeenCalledWith("foo", "2_r1");
      expect(screen.queryByText("D2_r1")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Analysis" }));
    await waitFor(() => {
      expect(
        screen.queryByText("2_r1.ulog.vehicle_local_position.x"),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByText("2.ulog.vehicle_local_position.x"),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("lists D2_r1 on Sources and Analysis after a successful replay", async () => {
    const withoutReplay = {
      slug: "foo",
      manifest: {
        name: "Foo",
        drones: [
          { id: 1 },
          { id: 2, sources: { ulg: ["raw/drone_2/d2.ulg"] } },
        ],
      },
    };
    const withReplay = {
      slug: "foo",
      manifest: {
        name: "Foo",
        drones: [
          { id: 1 },
          { id: 2, sources: { ulg: ["raw/drone_2/d2.ulg"] } },
          {
            id: "2_r1",
            kind: "replay",
            sources: { ulg: ["raw/drone_2_r1/replayed_r1.ulg"] },
          },
        ],
        ui: { visible_drone_ids: [1, 2, "2_r1"] },
      },
    };
    vi.mocked(listExperiments).mockResolvedValue([
      { slug: "foo", name: "Foo", drone_ids: ["1", "2"], missing: [] },
    ]);
    vi.mocked(openExperiment).mockResolvedValue(withoutReplay);
    vi.mocked(inspectReplay).mockResolvedValue({
      run_id: "abc",
      params: [],
      topics: [],
      duration_s: 1,
      warnings: [],
    });
    vi.mocked(startReplay).mockImplementation(async () => {
      vi.mocked(listExperiments).mockResolvedValue([
        { slug: "foo", name: "Foo", drone_ids: ["1", "2", "2_r1"], missing: [] },
      ]);
      vi.mocked(openExperiment).mockResolvedValue(withReplay);
      return { ok: true, run_id: "abc" };
    });
    vi.mocked(getReplay).mockResolvedValue({
      status: "success",
      results_dir: "/tmp/results",
      replay_id: "2_r1",
      error: null,
    });

    const user = userEvent.setup();
    renderApp();
    const picker = screen.getByRole("combobox", { name: "Experiment" });
    await waitFor(() => {
      expect(within(picker).getByRole("option", { name: "foo" })).toBeInTheDocument();
    });
    await user.selectOptions(picker, "foo");
    await waitFor(() => {
      expect(screen.getByText("D2")).toBeInTheDocument();
    });
    expect(screen.queryByText("D2_r1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Replay" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Replay drone" }),
      "2",
    );
    await waitFor(() => {
      expect(inspectReplay).toHaveBeenCalledWith("foo", 2);
    });
    await user.click(screen.getByRole("button", { name: "Replay" }));
    await waitFor(() => {
      expect(screen.getByText("success")).toBeInTheDocument();
      expect(screen.getByText("2_r1")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Sources" }));
    await waitFor(() => {
      expect(screen.getByText("D2_r1")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Delete D2_r1" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Analysis" }));
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /^D2_r1$/ })).toBeInTheDocument();
    });
  });

  it("shows Replay tabpanel when Replay is clicked", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("tab", { name: "Replay" }));
    const panel = await screen.findByRole("tabpanel", { name: /replay/i });
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText(/Open an experiment/)).toBeInTheDocument();
  });

  it("hydrates Analysis sync from manifest and patches on Manual toggle", async () => {
    vi.mocked(listExperiments).mockResolvedValue([
      { slug: "foo", name: "Foo", drone_ids: ["2", "3"], missing: [] },
    ]);
    vi.mocked(openExperiment).mockResolvedValue({
      slug: "foo",
      manifest: {
        name: "Foo",
        drones: [{ id: 2 }, { id: 3 }],
        sync: {
          mode: "arm",
          main_drone_id: "2",
          manual_offsets_s: { "2": 0, "3": 1.5 },
        },
      },
    });
    vi.mocked(getPose).mockResolvedValue({
      t: 0,
      origin: { lat: 0, lon: 0, alt_m: 0 },
      drones: {
        "2": { present: true, synced: false },
        "3": { present: true, synced: true },
      },
    });

    const panel = await openAnalysis();
    expect(within(panel).getByRole("button", { name: "ARM" })).toBeInTheDocument();
    expect(within(panel).getByRole("status")).toHaveTextContent("ARM unsynced: 2");

    const user = userEvent.setup();
    await user.click(within(panel).getByRole("button", { name: "Manual" }));

    await waitFor(() => {
      expect(patchManifest).toHaveBeenCalledWith(
        "foo",
        expect.objectContaining({
          sync: expect.objectContaining({ mode: "manual" }),
        }),
      );
    });
    expect(within(panel).queryByText(/ARM unsynced/)).not.toBeInTheDocument();
    expect(within(panel).getByLabelText("Main drone")).toHaveValue("2");
    expect(within(panel).getByLabelText("D3 offset s")).toHaveValue(1.5);
  });

  it("rebases sparse offsets when main drone changes", async () => {
    vi.mocked(listExperiments).mockResolvedValue([
      { slug: "foo", name: "Foo", drone_ids: ["1", "2"], missing: [] },
    ]);
    vi.mocked(openExperiment).mockResolvedValue({
      slug: "foo",
      manifest: {
        name: "Foo",
        drones: [{ id: 1 }, { id: 2 }],
        sync: {
          mode: "manual",
          main_drone_id: "1",
          manual_offsets_s: {},
        },
      },
    });
    vi.mocked(getPose).mockResolvedValue({
      t: 0,
      origin: { lat: 0, lon: 0, alt_m: 0 },
      drones: {
        "1": { present: true, synced: true },
        "2": { present: true, synced: true },
      },
    });

    const user = userEvent.setup();
    const panel = await openAnalysis();
    const offset = within(panel).getByLabelText("D2 offset s");
    await user.clear(offset);
    await user.type(offset, "1.5");
    await user.tab();

    await waitFor(() => {
      expect(patchManifest).toHaveBeenCalledWith(
        "foo",
        expect.objectContaining({
          sync: expect.objectContaining({
            mode: "manual",
            manual_offsets_s: expect.objectContaining({ "2": 1.5 }),
          }),
        }),
      );
    });

    vi.mocked(patchManifest).mockClear();
    await user.selectOptions(within(panel).getByLabelText("Main drone"), "2");

    await waitFor(() => {
      expect(patchManifest).toHaveBeenCalledWith(
        "foo",
        expect.objectContaining({
          sync: expect.objectContaining({
            mode: "manual",
            main_drone_id: "2",
            manual_offsets_s: { "1": -1.5, "2": 0 },
          }),
        }),
      );
    });
  });

  it("keeps Replay drone selected when switching to Analysis and back", async () => {
    vi.mocked(listExperiments).mockResolvedValue([
      { slug: "foo", name: "Foo", drone_ids: ["2"], missing: [] },
    ]);
    vi.mocked(openExperiment).mockResolvedValue({
      slug: "foo",
      manifest: {
        name: "Foo",
        drones: [{ id: 2, sources: { ulg: ["raw/drone_2/d2.ulg"] } }],
      },
    });
    vi.mocked(inspectReplay).mockResolvedValue({
      run_id: "abc",
      params: [],
      topics: [],
      duration_s: 1,
      warnings: [],
    });
    const user = userEvent.setup();
    renderApp();
    const picker = screen.getByRole("combobox", { name: "Experiment" });
    await waitFor(() => {
      expect(within(picker).getByRole("option", { name: "foo" })).toBeInTheDocument();
    });
    await user.selectOptions(picker, "foo");
    await user.click(screen.getByRole("tab", { name: "Replay" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Replay drone" }),
      "2",
    );
    await waitFor(() => {
      expect(inspectReplay).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole("tab", { name: "Analysis" }));
    await user.click(screen.getByRole("tab", { name: "Replay" }));
    expect(screen.getByRole("combobox", { name: "Replay drone" })).toHaveValue("2");
    expect(inspectReplay).toHaveBeenCalledTimes(1);
  });
});


