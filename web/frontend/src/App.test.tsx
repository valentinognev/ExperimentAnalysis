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

  it("shows Replay tabpanel when Replay is clicked", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("tab", { name: "Replay" }));
    const panel = await screen.findByRole("tabpanel", { name: /replay/i });
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText(/Open an experiment/)).toBeInTheDocument();
  });
});

