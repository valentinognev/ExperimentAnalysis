// @vitest-environment jsdom
import { render, screen, cleanup, within, act, waitFor } from "@testing-library/react";
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
import { loadSession, saveSession } from "../replay/sessionPrefs";
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

it("failed inspect on D3 does not keep D2's run_id", async () => {
  vi.mocked(inspectReplay)
    .mockResolvedValueOnce({
      run_id: "abc",
      params: [],
      topics: [],
      duration_s: 1,
      warnings: [],
    })
    .mockRejectedValueOnce(new Error("inspect failed"));
  renderTab();
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Replay drone" }),
    "2",
  );
  expect(await screen.findByText("abc")).toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Replay drone" }),
    "3",
  );
  expect(await screen.findByText(/inspect failed/)).toBeInTheDocument();
  expect(screen.queryByText("abc")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Replay" })).toBeDisabled();
});

it("overlapping inspect ignores the older response", async () => {
  let resolveD2!: (value: {
    run_id: string;
    params: unknown[];
    topics: unknown[];
    duration_s: number;
    warnings: string[];
  }) => void;
  const d2Inspect = new Promise<Parameters<typeof resolveD2>[0]>((resolve) => {
    resolveD2 = resolve;
  });
  vi.mocked(inspectReplay).mockImplementation((_slug, droneId) => {
    if (droneId === 2) return d2Inspect as ReturnType<typeof inspectReplay>;
    return Promise.resolve({
      run_id: "d3-run",
      params: [],
      topics: [],
      duration_s: 2,
      warnings: [],
    });
  });
  renderTab();
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Replay drone" }),
    "2",
  );
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Replay drone" }),
    "3",
  );
  expect(await screen.findByText("d3-run")).toBeInTheDocument();
  await act(async () => {
    resolveD2({
      run_id: "d2-run",
      params: [],
      topics: [],
      duration_s: 1,
      warnings: [],
    });
  });
  expect(screen.queryByText("d2-run")).not.toBeInTheDocument();
  expect(screen.getByText("d3-run")).toBeInTheDocument();
});

const emptySession = {
  ulgPath: "",
  filter: "EKF2",
  experimentName: "",
  overrides: {},
  slug: "",
  droneId: null as number | null,
};

it("selecting D2 saves slug and droneId", async () => {
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
  expect(loadSession().slug).toBe("foo");
  expect(loadSession().droneId).toBe(2);
});

it("restores last drone for this slug and inspects", async () => {
  saveSession({ ...emptySession, slug: "foo", droneId: 2 });
  vi.mocked(inspectReplay).mockResolvedValue({
    run_id: "abc",
    params: [],
    topics: [],
    duration_s: 1,
    warnings: [],
  });
  renderTab();
  await waitFor(() => {
    expect(inspectReplay).toHaveBeenCalledWith("foo", 2);
  });
  expect(screen.getByRole("combobox", { name: "Replay drone" })).toHaveValue("2");
});

it("does not restore a drone from another slug", () => {
  saveSession({ ...emptySession, slug: "bar", droneId: 2 });
  renderTab();
  expect(inspectReplay).not.toHaveBeenCalled();
  expect(screen.getByRole("combobox", { name: "Replay drone" })).toHaveValue("");
});

it("does not restore a drone that has no ulog", () => {
  saveSession({ ...emptySession, slug: "foo", droneId: 1 });
  renderTab();
  expect(inspectReplay).not.toHaveBeenCalled();
  expect(screen.getByRole("combobox", { name: "Replay drone" })).toHaveValue("");
});

it("clears inspect when the slug changes and session does not match", async () => {
  vi.mocked(inspectReplay).mockResolvedValue({
    run_id: "abc",
    params: [],
    topics: [],
    duration_s: 1,
    warnings: [],
  });
  const { rerender } = renderTab();
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Replay drone" }),
    "2",
  );
  expect(await screen.findByText("abc")).toBeInTheDocument();
  rerender(
    <SkinProvider>
      <ReplayTab slug="bar" manifest={manifest} />
    </SkinProvider>,
  );
  expect(screen.queryByText("abc")).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Replay drone" })).toHaveValue("");
});
