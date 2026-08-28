// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import ExperimentBar from "./ExperimentBar";

vi.mock("../api", () => ({
  listExperiments: vi.fn(),
  createExperiment: vi.fn(),
  importPaths: vi.fn(),
  openExperiment: vi.fn(),
  rebuild: vi.fn(),
  browseFolder: vi.fn(),
}));

import {
  listExperiments,
  createExperiment,
  importPaths,
  openExperiment,
  rebuild,
  browseFolder,
} from "../api";

describe("ExperimentBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listExperiments).mockResolvedValue([]);
    vi.mocked(createExperiment).mockResolvedValue({ slug: "foo", manifest: {} });
    vi.mocked(importPaths).mockResolvedValue({});
    vi.mocked(openExperiment).mockResolvedValue({ slug: "foo", manifest: {} });
    vi.mocked(rebuild).mockResolvedValue({});
    vi.mocked(browseFolder).mockResolvedValue({ path: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("enables Browse when a slug is selected", () => {
    render(<ExperimentBar slug="foo" onSlugChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Browse" })).toBeEnabled();
  });

  it("fills Import path when Browse returns a folder and does not import", async () => {
    vi.mocked(browseFolder).mockResolvedValue({ path: "/tmp/sitl" });
    const user = userEvent.setup();
    render(<ExperimentBar slug="foo" onSlugChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("path to .ulg or logs dir"),
      ).toHaveValue("/tmp/sitl");
    });
    expect(importPaths).not.toHaveBeenCalled();
    expect(rebuild).not.toHaveBeenCalled();
  });

  it("hides New, Import, and Rebuild when showSetup is false", () => {
    render(
      <ExperimentBar slug="foo" onSlugChange={() => {}} showSetup={false} />,
    );

    expect(screen.getByLabelText("Experiment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Browse" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rebuild" })).not.toBeInTheDocument();
  });

  it("Rebuild notifies onRebuilt, not onImported", async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    const onRebuilt = vi.fn();
    render(
      <ExperimentBar
        slug="foo"
        onSlugChange={() => {}}
        onImported={onImported}
        onRebuilt={onRebuilt}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rebuild" }));
    await waitFor(() => {
      expect(rebuild).toHaveBeenCalledWith("foo");
      expect(onRebuilt).toHaveBeenCalled();
    });
    expect(onImported).not.toHaveBeenCalled();
  });

  it("leaves Import path unchanged when Browse is cancelled", async () => {
    vi.mocked(browseFolder).mockResolvedValue({ path: null });
    const user = userEvent.setup();
    render(<ExperimentBar slug="foo" onSlugChange={() => {}} />);

    const input = screen.getByPlaceholderText("path to .ulg or logs dir");
    await user.type(input, "/keep/this");
    await user.click(screen.getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Browse" })).toBeEnabled();
    });
    expect(input).toHaveValue("/keep/this");
    expect(importPaths).not.toHaveBeenCalled();
  });
});
