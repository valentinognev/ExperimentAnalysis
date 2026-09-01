// @vitest-environment jsdom
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("react-plotly.js", () => ({
  default: function MockPlot() {
    return <div data-testid="plotly" />;
  },
}));

vi.mock("../api", () => ({
  inspectReplay: vi.fn(),
  startReplay: vi.fn(),
  getReplay: vi.fn(),
  stopReplay: vi.fn(),
  getReplaySeries: vi.fn(),
}));

import { inspectReplay } from "../api";
import { SkinProvider } from "../SkinContext";
import ReplayTab from "./ReplayTab";

const manifest = {
  drones: [
    { id: 1, sources: { ulg: [] } },
    { id: 2, sources: { ulg: ["raw/drone_2/a.ulg"] } },
    { id: 3, sources: { ulg: ["raw/drone_3/b.ulg"] } },
    { id: "2_r1", sources: { ulg: ["raw/drone_2_r1/replayed_r1.ulg"] } },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

function renderTab() {
  return render(
    <SkinProvider>
      <ReplayTab slug="foo" manifest={manifest} />
    </SkinProvider>,
  );
}

it("lists physical drones with ulogs as D{id}", () => {
  renderTab();
  const select = screen.getByRole("combobox", { name: "Replay drone" });
  expect(within(select).queryByRole("option", { name: "D1" })).not.toBeInTheDocument();
  expect(within(select).getByRole("option", { name: "D2" })).toBeInTheDocument();
  expect(within(select).getByRole("option", { name: "D3" })).toBeInTheDocument();
  expect(within(select).queryByRole("option", { name: "D2_r1" })).not.toBeInTheDocument();
});

it("selecting D2 calls inspectReplay", async () => {
  vi.mocked(inspectReplay).mockResolvedValue({
    run_id: "abc",
    params: [],
    topics: [],
    duration_s: 1,
    warnings: [],
  });
  renderTab();
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Replay drone" }),
    "2",
  );
  expect(inspectReplay).toHaveBeenCalledWith("foo", 2);
});
