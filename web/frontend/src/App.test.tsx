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
  });

  async function openAnalysis() {
    const user = userEvent.setup();
    render(<App />);
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
});
