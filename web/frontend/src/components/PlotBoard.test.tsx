// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

type PlotTrace = {
  name?: string;
  line?: { color?: string; dash?: string; width?: number };
};

type PlotProps = {
  data?: PlotTrace[];
  layout?: {
    margin?: { l?: number; r?: number; t?: number; b?: number };
    xaxis?: {
      range?: [number, number];
      autorange?: boolean;
      automargin?: boolean;
      gridcolor?: string;
    };
    yaxis?: { gridcolor?: string; automargin?: boolean };
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
import { PLOT_TIME_MARGIN } from "../channelPlotAxis";
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

it("opens the edit picker below the edited plot, not above the first plot", async () => {
  const user = userEvent.setup();
  const plots = [
    { id: "p1", channels: ["2.ulog.vehicle_local_position.x"] },
    { id: "p2", channels: ["2.ulog.vehicle_local_position.y"] },
  ];
  render(
    <PlotBoard slug="exp" t={0} tMax={60} plots={plots} onPlotsChange={() => {}} />,
  );
  await waitFor(() => {
    expect(screen.getAllByTestId("plotly")).toHaveLength(2);
  });
  await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
  const search = await screen.findByRole("searchbox", { name: "Search channels" });
  const figures = screen.getAllByTestId("plotly");
  expect(figures[1].compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(search.compareDocumentPosition(figures[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(0);
});

it("keeps the add-plot picker above the figures", async () => {
  const user = userEvent.setup();
  const plots = [{ id: "p1", channels: ["2.ulog.vehicle_local_position.x"] }];
  render(
    <PlotBoard slug="exp" t={0} tMax={60} plots={plots} onPlotsChange={() => {}} />,
  );
  await waitFor(() => {
    expect(screen.getByTestId("plotly")).toBeInTheDocument();
  });
  await user.click(screen.getByRole("button", { name: "Add plot" }));
  const search = await screen.findByRole("searchbox", { name: "Search channels" });
  const figure = screen.getByTestId("plotly");
  expect(search.compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("Move up swaps that plot with the one above", async () => {
  const user = userEvent.setup();
  const onPlotsChange = vi.fn();
  const plots = [
    { id: "p1", channels: ["2.ulog.vehicle_local_position.x"] },
    { id: "p2", channels: ["2.ulog.vehicle_local_position.y"] },
  ];
  render(
    <PlotBoard slug="exp" t={0} tMax={60} plots={plots} onPlotsChange={onPlotsChange} />,
  );
  await waitFor(() => {
    expect(screen.getAllByTestId("plotly")).toHaveLength(2);
  });
  await user.click(screen.getAllByRole("button", { name: "Move up" })[1]);
  expect(onPlotsChange.mock.calls[0][0].map((p: { id: string }) => p.id)).toEqual([
    "p2",
    "p1",
  ]);
});

it("disables Move up on the first plot and Move down on the last", async () => {
  const plots = [
    { id: "p1", channels: ["2.ulog.vehicle_local_position.x"] },
    { id: "p2", channels: ["2.ulog.vehicle_local_position.y"] },
  ];
  render(
    <PlotBoard slug="exp" t={0} tMax={60} plots={plots} onPlotsChange={() => {}} />,
  );
  await waitFor(() => {
    expect(screen.getAllByTestId("plotly")).toHaveLength(2);
  });
  expect(screen.getAllByRole("button", { name: "Move up" })[0]).toBeDisabled();
  expect(screen.getAllByRole("button", { name: "Move down" })[1]).toBeDisabled();
  expect(screen.getAllByRole("button", { name: "Move up" })[1]).toBeEnabled();
  expect(screen.getAllByRole("button", { name: "Move down" })[0]).toBeEnabled();
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
  expect(lastPlot?.layout?.xaxis?.automargin).toBe(false);
  expect(lastPlot?.layout?.yaxis?.automargin).toBe(false);
  expect(lastPlot?.layout?.margin).toEqual(PLOT_TIME_MARGIN);
  expect(lastPlot?.layout?.paper_bgcolor).toBe("#09090b");
  expect(lastPlot?.layout?.shapes?.[0]?.line?.color).toBe("#fafafa");
});

it("does not add extra horizontal padding around extra-pane figures", async () => {
  const plots = [{ id: "p1", channels: ["2.ulog.vehicle_local_position.x"] }];
  render(
    <PlotBoard slug="exp" t={0} tMax={60} plots={plots} onPlotsChange={() => {}} />,
  );
  await waitFor(() => {
    expect(screen.getByTestId("plotly")).toBeInTheDocument();
  });
  const pane = screen.getByTestId("plotly").closest(".rounded");
  expect(pane?.className.split(/\s+/)).not.toContain("p-2");
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
  expect(lastPlot?.layout?.xaxis?.gridcolor).toBe("#d4d4d8");
  expect(lastPlot?.layout?.yaxis?.gridcolor).toBe("#d4d4d8");
});

it("changes dash when two traces wrap to the same color", async () => {
  const channels = [
    "2.ulog.a.x",
    "2.ulog.b.x",
    "2.ulog.c.x",
    "2.ulog.d.x",
    "2.ulog.e.x",
    "2.ulog.f.x",
  ];
  const series: Record<string, { t: number[]; y: number[] }> = {};
  for (const ch of channels) series[ch] = { t: [0], y: [1] };
  vi.mocked(getSeries).mockResolvedValue(series);
  render(
    <PlotBoard
      slug="exp"
      t={0}
      tMax={60}
      plots={[{ id: "p1", channels }]}
      onPlotsChange={() => {}}
    />,
  );
  await waitFor(() => {
    expect(lastPlot?.data).toHaveLength(6);
  });
  const traces = lastPlot?.data ?? [];
  expect(traces[0].line?.color).toBe(traces[5].line?.color);
  expect(traces[0].line?.dash).toBe("solid");
  expect(traces[5].line?.dash).toBe("dash");
  expect(traces[1].line?.dash).toBe("solid");
});

function extraPlots(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    channels: ["2.ulog.vehicle_local_position.x"],
  }));
}

it("inserts a time scrubber before every third figure, counting the NED plot as first", async () => {
  render(
    <PlotBoard
      slug="exp"
      t={40}
      tMax={80}
      plots={extraPlots(5)}
      onPlotsChange={() => {}}
    />,
  );
  await waitFor(() => {
    expect(screen.getAllByTestId("plotly")).toHaveLength(5);
  });
  const sliders = screen.getAllByRole("slider", { name: "Time scrubber" });
  expect(sliders).toHaveLength(1);
  const figures = screen.getAllByTestId("plotly");
  expect(
    figures[1].compareDocumentPosition(sliders[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    sliders[0].compareDocumentPosition(figures[2]) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByTestId("time-scrubber-thumb")).toHaveStyle({ left: "50%" });
});

it("adds another scrubber when a second group of three figures starts", async () => {
  render(
    <PlotBoard
      slug="exp"
      t={0}
      tMax={60}
      plots={extraPlots(6)}
      onPlotsChange={() => {}}
    />,
  );
  await waitFor(() => {
    expect(screen.getAllByTestId("plotly")).toHaveLength(6);
  });
  expect(screen.getAllByRole("slider", { name: "Time scrubber" })).toHaveLength(2);
});

it("does not insert a PlotBoard scrubber when extras do not start a new group of three", async () => {
  render(
    <PlotBoard
      slug="exp"
      t={0}
      tMax={60}
      plots={extraPlots(2)}
      onPlotsChange={() => {}}
    />,
  );
  await waitFor(() => {
    expect(screen.getAllByTestId("plotly")).toHaveLength(2);
  });
  expect(screen.queryByRole("slider", { name: "Time scrubber" })).not.toBeInTheDocument();
});
