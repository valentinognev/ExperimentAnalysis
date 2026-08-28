// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import ExperimentBar from "./ExperimentBar";

vi.mock("../api", () => ({
  listExperiments: vi.fn(),
  createExperiment: vi.fn(),
  addDrone: vi.fn(),
  rebuild: vi.fn(),
}));

import {
  listExperiments,
  createExperiment,
  addDrone,
  rebuild,
} from "../api";

describe("ExperimentBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listExperiments).mockResolvedValue([]);
    vi.mocked(createExperiment).mockResolvedValue({ slug: "foo", manifest: {} });
    vi.mocked(addDrone).mockResolvedValue({ slug: "foo", manifest: {} });
    vi.mocked(rebuild).mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Drone # and Add when setup is shown, not Import or Browse", () => {
    render(<ExperimentBar slug="foo" onSlugChange={() => {}} />);

    expect(screen.getByLabelText("Drone #")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Browse" })).not.toBeInTheDocument();
  });

  it("enables Add only with a slug and a positive integer in Drone #", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ExperimentBar slug={null} onSlugChange={() => {}} />,
    );
    await user.type(screen.getByLabelText("Drone #"), "2");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

    rerender(<ExperimentBar slug="foo" onSlugChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();

    await user.clear(screen.getByLabelText("Drone #"));
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

    await user.type(screen.getByLabelText("Drone #"), "0");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Drone #"));
    await user.type(screen.getByLabelText("Drone #"), "2");
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  });

  it("click Add calls addDrone then onDronesChange and clears the field", async () => {
    const user = userEvent.setup();
    const onDronesChange = vi.fn();
    render(
      <ExperimentBar
        slug="foo"
        onSlugChange={() => {}}
        onDronesChange={onDronesChange}
      />,
    );

    await user.type(screen.getByLabelText("Drone #"), "2");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(addDrone).toHaveBeenCalledWith("foo", 2);
      expect(onDronesChange).toHaveBeenCalled();
    });
    expect(addDrone.mock.invocationCallOrder[0]).toBeLessThan(
      onDronesChange.mock.invocationCallOrder[0],
    );
    expect(listExperiments).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Drone #")).toHaveValue(null);
  });

  it("hides New, Drone #, Add, and Rebuild when showSetup is false", () => {
    render(
      <ExperimentBar slug="foo" onSlugChange={() => {}} showSetup={false} />,
    );

    expect(screen.getByLabelText("Experiment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Drone #")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rebuild" })).not.toBeInTheDocument();
  });

  it("Rebuild notifies onRebuilt, not onDronesChange", async () => {
    const user = userEvent.setup();
    const onDronesChange = vi.fn();
    const onRebuilt = vi.fn();
    render(
      <ExperimentBar
        slug="foo"
        onSlugChange={() => {}}
        onDronesChange={onDronesChange}
        onRebuilt={onRebuilt}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rebuild" }));
    await waitFor(() => {
      expect(rebuild).toHaveBeenCalledWith("foo");
      expect(onRebuilt).toHaveBeenCalled();
    });
    expect(onDronesChange).not.toHaveBeenCalled();
  });
});
