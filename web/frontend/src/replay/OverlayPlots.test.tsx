// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { OverlayPlots } from "./OverlayPlots";

type PlotLayout = {
  paper_bgcolor?: string;
  plot_bgcolor?: string;
  font?: { color?: string };
  xaxis?: { gridcolor?: string };
  yaxis?: { gridcolor?: string };
};

const { lastLayoutRef } = vi.hoisted(() => ({
  lastLayoutRef: { current: undefined as PlotLayout | undefined },
}));

vi.mock("react-plotly.js", () => ({
  default: ({ layout }: { layout?: PlotLayout }) => {
    lastLayoutRef.current = layout;
    return <div data-testid="plotly" />;
  },
}));

vi.mock("../api", () => ({
  getReplaySeries: vi.fn(),
}));
import { getReplaySeries } from "../api";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  lastLayoutRef.current = undefined;
});

const field = {
  t_original: [0],
  original: [1],
  t_replayed: [0],
  replayed: [2],
};

const attitude = {
  "q[0]": field,
  "q[1]": field,
  "q[2]": field,
  "q[3]": field,
};

const local = {
  x: field,
  y: field,
  z: field,
};

it("does not fetch without runId", () => {
  render(<OverlayPlots slug="foo" runId={null} status="success" />);
  expect(getReplaySeries).not.toHaveBeenCalled();
});

it("does not fetch unless status is success", () => {
  render(<OverlayPlots slug="foo" runId="abc" status="running" />);
  expect(getReplaySeries).not.toHaveBeenCalled();
});

it("fetches getReplaySeries when runId and status is success", async () => {
  vi.mocked(getReplaySeries).mockResolvedValue({
    vehicle_attitude: attitude,
    vehicle_local_position: local,
  });
  render(<OverlayPlots slug="foo" runId="abc" status="success" />);
  expect(getReplaySeries).toHaveBeenCalledWith("foo", "abc");
  expect(await screen.findByText("vehicle_attitude")).toBeInTheDocument();
  expect(screen.getByText("vehicle_local_position")).toBeInTheDocument();
  expect(screen.getAllByTestId("plotly")).toHaveLength(2);
});

it("omits innovations pane when topic is absent", async () => {
  vi.mocked(getReplaySeries).mockResolvedValue({
    vehicle_attitude: attitude,
    vehicle_local_position: local,
  });
  render(<OverlayPlots slug="foo" runId="abc" status="success" />);
  await screen.findByText("vehicle_attitude");
  expect(screen.queryByText("estimator_innovations")).not.toBeInTheDocument();
});

it("shows innovations pane when present", async () => {
  vi.mocked(getReplaySeries).mockResolvedValue({
    vehicle_attitude: attitude,
    vehicle_local_position: local,
    estimator_innovations: { x: field },
  });
  render(<OverlayPlots slug="foo" runId="abc" status="success" />);
  expect(await screen.findByText("estimator_innovations")).toBeInTheDocument();
  expect(screen.getAllByTestId("plotly")).toHaveLength(3);
});

it("uses night paper by default", async () => {
  vi.mocked(getReplaySeries).mockResolvedValue({
    vehicle_attitude: attitude,
    vehicle_local_position: local,
  });
  render(<OverlayPlots slug="foo" runId="abc" status="success" />);
  await screen.findByText("vehicle_attitude");
  expect(lastLayoutRef.current?.paper_bgcolor).toBe("#09090b");
  expect(lastLayoutRef.current?.plot_bgcolor).toBe("#18181b");
  expect(lastLayoutRef.current?.font?.color).toBe("#e4e4e7");
  expect(lastLayoutRef.current?.xaxis?.gridcolor).toBe("#3f3f46");
});

it("uses day paper when skin is day", async () => {
  vi.mocked(getReplaySeries).mockResolvedValue({
    vehicle_attitude: attitude,
    vehicle_local_position: local,
  });
  render(<OverlayPlots slug="foo" runId="abc" status="success" skin="day" />);
  await screen.findByText("vehicle_attitude");
  expect(lastLayoutRef.current?.paper_bgcolor).toBe("#fafafa");
  expect(lastLayoutRef.current?.plot_bgcolor).toBe("#ffffff");
  expect(lastLayoutRef.current?.font?.color).toBe("#18181b");
  expect(lastLayoutRef.current?.xaxis?.gridcolor).toBe("#d4d4d8");
});
