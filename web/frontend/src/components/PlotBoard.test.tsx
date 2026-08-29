// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

type PlotProps = {
  layout?: {
    xaxis?: { range?: [number, number]; autorange?: boolean };
    paper_bgcolor?: string;
    shapes?: Array<{ line?: { color?: string } }>;
  };
};

let lastPlot: PlotProps | null = null;

vi.mock("react-plotly.js", () => ({
  default: function MockPlot(props: PlotProps) {
    lastPlot = props;
    return <div data-testid="plotly" />;
  },
}));

vi.mock("../api", () => ({
  getTopics: vi.fn(),
  getSeries: vi.fn(),
}));

import { getTopics, getSeries } from "../api";
import PlotBoard from "./PlotBoard";

const topics = {
  "2": { ulog: { vehicle_local_position: ["x", "y"] } },
};

beforeEach(() => {
  lastPlot = null;
  vi.mocked(getTopics).mockResolvedValue(topics);
  vi.mocked(getSeries).mockResolvedValue({
    "2.ulog.vehicle_local_position.x": { t: [0], y: [1] },
    "2.ulog.vehicle_local_position.y": { t: [0], y: [2] },
  });
});

afterEach(() => cleanup());

async function expandToFields(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
  });
  await user.click(screen.getByRole("button", { name: "2" }));
  await user.click(screen.getByRole("button", { name: "2.ulog" }));
  await user.click(screen.getByRole("button", { name: "2.ulog.vehicle_local_position" }));
}

it("does not add a plot until Apply", async () => {
  const user = userEvent.setup();
  const onPlotsChange = vi.fn();
  render(
    <PlotBoard slug="exp" t={0} tMax={60} plots={[]} onPlotsChange={onPlotsChange} />,
  );
  await user.click(screen.getByRole("button", { name: "Add plot" }));
  await expandToFields(user);
  await user.click(screen.getByRole("checkbox", { name: "2.ulog.vehicle_local_position.x" }));
  expect(onPlotsChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Apply" }));
  expect(onPlotsChange).toHaveBeenCalledTimes(1);
  const next = onPlotsChange.mock.calls[0][0];
  expect(next).toHaveLength(1);
  expect(next[0].channels).toEqual(["2.ulog.vehicle_local_position.x"]);
});

it("Edit updates the same plot channels", async () => {
  const user = userEvent.setup();
  const onPlotsChange = vi.fn();
  const plots = [{ id: "p1", channels: ["2.ulog.vehicle_local_position.x"] }];
  render(
    <PlotBoard slug="exp" t={0} tMax={60} plots={plots} onPlotsChange={onPlotsChange} />,
  );
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await expandToFields(user);
  expect(screen.getByRole("checkbox", { name: "2.ulog.vehicle_local_position.x" })).toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: "2.ulog.vehicle_local_position.y" }));
  await user.click(screen.getByRole("button", { name: "Apply" }));
  expect(onPlotsChange.mock.calls[0][0][0]).toEqual({
    id: "p1",
    channels: [
      "2.ulog.vehicle_local_position.x",
      "2.ulog.vehicle_local_position.y",
    ],
  });
});

it("closes the picker when the edited plot is removed", async () => {
  const user = userEvent.setup();
  const onPlotsChange = vi.fn();
  const plots = [{ id: "p1", channels: ["2.ulog.vehicle_local_position.x"] }];
  render(
    <PlotBoard slug="exp" t={0} tMax={60} plots={plots} onPlotsChange={onPlotsChange} />,
  );
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await waitFor(() => {
    expect(screen.getByRole("searchbox", { name: "Search channels" })).toBeInTheDocument();
  });
  await user.click(screen.getByRole("button", { name: "Remove" }));
  expect(screen.queryByRole("searchbox", { name: "Search channels" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
});

it("pins extra-pane x-axis to experiment duration even when series is shorter", async () => {
  vi.mocked(getSeries).mockResolvedValue({
    "2.sm.sm_system_manager.pos_ned/x": { t: [0, 140], y: [0, 1] },
  });
  const plots = [{ id: "p1", channels: ["2.sm.sm_system_manager.pos_ned/x"] }];
  render(
    <PlotBoard
      slug="exp"
      t={0}
      tMax={160}
      plots={plots}
      onPlotsChange={() => {}}
    />,
  );
  await waitFor(() => {
    expect(lastPlot?.layout?.xaxis?.range).toEqual([0, 160]);
  });
  expect(lastPlot?.layout?.xaxis?.autorange).toBe(false);
  expect(lastPlot?.layout?.paper_bgcolor).toBe("#09090b");
  expect(lastPlot?.layout?.shapes?.[0]?.line?.color).toBe("#fafafa");
});

it("uses day paper when skin is day", async () => {
  vi.mocked(getSeries).mockResolvedValue({
    "2.sm.sm_system_manager.pos_ned/x": { t: [0, 140], y: [0, 1] },
  });
  const plots = [{ id: "p1", channels: ["2.sm.sm_system_manager.pos_ned/x"] }];
  render(
    <PlotBoard
      slug="exp"
      t={0}
      tMax={160}
      plots={plots}
      onPlotsChange={() => {}}
      skin="day"
    />,
  );
  await waitFor(() => {
    expect(lastPlot?.layout?.paper_bgcolor).toBe("#fafafa");
  });
  expect(lastPlot?.layout?.shapes?.[0]?.line?.color).toBe("#18181b");
});
