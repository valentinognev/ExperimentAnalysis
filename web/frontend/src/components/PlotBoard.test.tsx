// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

vi.mock("react-plotly.js", () => ({
  default: function MockPlot() {
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
  vi.mocked(getTopics).mockResolvedValue(topics);
  vi.mocked(getSeries).mockResolvedValue({
    "2.ulog.vehicle_local_position.x": { t: [0], y: [1] },
    "2.ulog.vehicle_local_position.y": { t: [0], y: [2] },
  });
});

afterEach(() => cleanup());

async function expandToFields(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "2" }));
  await user.click(screen.getByRole("button", { name: "2.ulog" }));
  await user.click(screen.getByRole("button", { name: "2.ulog.vehicle_local_position" }));
}

it("does not add a plot until Apply", async () => {
  const user = userEvent.setup();
  const onPlotsChange = vi.fn();
  render(
    <PlotBoard slug="exp" t={0} plots={[]} onPlotsChange={onPlotsChange} />,
  );
  await user.click(screen.getByRole("button", { name: "Add plot" }));
  await waitFor(() => {
    expect(screen.getByRole("searchbox", { name: "Search channels" })).toBeInTheDocument();
  });
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
    <PlotBoard slug="exp" t={0} plots={plots} onPlotsChange={onPlotsChange} />,
  );
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await waitFor(() => {
    expect(screen.getByRole("searchbox", { name: "Search channels" })).toBeInTheDocument();
  });
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
