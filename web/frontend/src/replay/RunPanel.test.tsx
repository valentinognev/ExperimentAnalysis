// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { RunPanel } from "./RunPanel";

vi.mock("../api", () => ({
  startReplay: vi.fn(),
  getReplay: vi.fn(),
  stopReplay: vi.fn(),
}));
import { getReplay, startReplay, stopReplay } from "../api";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

const overrides = { EKF2_RNG_NOISE: 0.2 };

it("Replay disabled without runId", () => {
  render(
    <RunPanel
      slug="foo"
      runId={null}
      droneId={2}
      overrides={overrides}
      busy={false}
    />,
  );
  expect(screen.getByRole("button", { name: "Replay" })).toBeDisabled();
});

it("Replay disabled when busy", () => {
  render(
    <RunPanel
      slug="foo"
      runId="abc"
      droneId={2}
      overrides={overrides}
      busy={true}
    />,
  );
  expect(screen.getByRole("button", { name: "Replay" })).toBeDisabled();
});

it("has no experiment name field", () => {
  render(
    <RunPanel
      slug="foo"
      runId="abc"
      droneId={2}
      overrides={overrides}
      busy={false}
    />,
  );
  expect(screen.queryByLabelText("Experiment name")).not.toBeInTheDocument();
});

it("click Replay sends slug and {run_id, drone_id, overrides}", async () => {
  vi.mocked(startReplay).mockResolvedValue({ ok: true, run_id: "abc" });
  vi.mocked(getReplay).mockResolvedValue({
    status: "success",
    results_dir: "/tmp/results",
    replay_id: "2_r1",
    error: null,
  });
  render(
    <RunPanel
      slug="foo"
      runId="abc"
      droneId={2}
      overrides={overrides}
      busy={false}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Replay" }));
  expect(startReplay).toHaveBeenCalledTimes(1);
  expect(startReplay).toHaveBeenCalledWith("foo", {
    run_id: "abc",
    drone_id: 2,
    overrides,
  });
});

it("409 shows already running", async () => {
  vi.mocked(startReplay).mockRejectedValue(
    new Error("409 replay already running"),
  );
  render(
    <RunPanel
      slug="foo"
      runId="abc"
      droneId={2}
      overrides={overrides}
      busy={false}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Replay" }));
  expect(await screen.findByText(/409/)).toBeInTheDocument();
  expect(screen.getByText(/already running/)).toBeInTheDocument();
});

it("failed status shows error", async () => {
  vi.mocked(startReplay).mockResolvedValue({ ok: true, run_id: "abc" });
  vi.mocked(getReplay).mockResolvedValue({
    status: "failed",
    results_dir: "/tmp/r",
    replay_id: null,
    error: "px4 crashed",
  });
  render(
    <RunPanel
      slug="foo"
      runId="abc"
      droneId={2}
      overrides={overrides}
      busy={false}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Replay" }));
  expect(await screen.findByText(/failed/)).toBeInTheDocument();
  expect(screen.getByText("px4 crashed")).toBeInTheDocument();
});

it("Stop is disabled when job status is success", async () => {
  vi.mocked(startReplay).mockResolvedValue({ ok: true, run_id: "abc" });
  vi.mocked(getReplay).mockResolvedValue({
    status: "success",
    results_dir: "/tmp/results",
    replay_id: "2_r1",
    error: null,
  });
  render(
    <RunPanel
      slug="foo"
      runId="abc"
      droneId={2}
      overrides={overrides}
      busy={false}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Replay" }));
  expect(await screen.findByText("success")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
});

it("Stop calls stopReplay(slug, runId)", async () => {
  vi.mocked(stopReplay).mockResolvedValue({ ok: true });
  render(
    <RunPanel
      slug="foo"
      runId="abc"
      droneId={2}
      overrides={overrides}
      busy={false}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(stopReplay).toHaveBeenCalledWith("foo", "abc");
});

it("Replay disabled while status is running", async () => {
  vi.mocked(startReplay).mockResolvedValue({ ok: true, run_id: "abc" });
  vi.mocked(getReplay).mockResolvedValue({
    status: "running",
    results_dir: null,
    replay_id: null,
    error: null,
  });
  render(
    <RunPanel
      slug="foo"
      runId="abc"
      droneId={2}
      overrides={overrides}
      busy={false}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Replay" }));
  expect(await screen.findByText("running")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Replay" })).toBeDisabled();
});

it("changing runId clears previous job display", async () => {
  vi.mocked(startReplay).mockResolvedValue({ ok: true, run_id: "abc" });
  vi.mocked(getReplay).mockResolvedValue({
    status: "success",
    results_dir: "/tmp/results",
    replay_id: "2_r1",
    error: null,
  });
  const onJob = vi.fn();
  const { rerender } = render(
    <RunPanel
      slug="foo"
      runId="abc"
      droneId={2}
      overrides={overrides}
      busy={false}
      onJob={onJob}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Replay" }));
  expect(await screen.findByText("success")).toBeInTheDocument();
  expect(screen.getByText("/tmp/results")).toBeInTheDocument();
  expect(screen.getByText("2_r1")).toBeInTheDocument();

  rerender(
    <RunPanel
      slug="foo"
      runId="def"
      droneId={2}
      overrides={overrides}
      busy={false}
      onJob={onJob}
    />,
  );
  expect(screen.queryByText("success")).not.toBeInTheDocument();
  expect(screen.queryByText("/tmp/results")).not.toBeInTheDocument();
  expect(screen.queryByText("2_r1")).not.toBeInTheDocument();
  expect(onJob).toHaveBeenCalledWith(null);
});

it("getReplay rejection shows error text", async () => {
  vi.mocked(startReplay).mockResolvedValue({ ok: true, run_id: "abc" });
  vi.mocked(getReplay)
    .mockResolvedValueOnce({
      status: "running",
      results_dir: null,
      replay_id: null,
      error: null,
    })
    .mockRejectedValue(new Error("status fetch failed"));
  render(
    <RunPanel
      slug="foo"
      runId="abc"
      droneId={2}
      overrides={overrides}
      busy={false}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Replay" }));
  expect(await screen.findByText("running")).toBeInTheDocument();
  expect(await screen.findByText("status fetch failed")).toBeInTheDocument();
});
