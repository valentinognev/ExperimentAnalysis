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
  setDroneCount: vi.fn(),
  patchManifest: vi.fn(),
}));

import {
  listExperiments,
  createExperiment,
  addDrone,
  setDroneCount,
  patchManifest,
} from "../api";

describe("ExperimentBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listExperiments).mockResolvedValue([]);
    vi.mocked(createExperiment).mockResolvedValue({ slug: "foo", manifest: {} });
    vi.mocked(addDrone).mockResolvedValue({ slug: "foo", manifest: {} });
    vi.mocked(setDroneCount).mockResolvedValue({ slug: "foo", manifest: {} });
    vi.mocked(patchManifest).mockResolvedValue({ slug: "foo", manifest: {} });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Drone # and Update when setup is shown, not Import, Browse, Add, or Rebuild", () => {
    render(<ExperimentBar slug="foo" onSlugChange={() => {}} />);

    expect(screen.getByRole("combobox", { name: "Drone #" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rebuild" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Browse" })).not.toBeInTheDocument();
  });

  it("Drone # is a dropdown of 1 through 9", () => {
    render(<ExperimentBar slug="foo" onSlugChange={() => {}} />);

    const select = screen.getByRole("combobox", { name: "Drone #" });
    const values = [...select.querySelectorAll("option")].map((o) => o.value);
    expect(values.filter((v) => v !== "")).toEqual(
      ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    );
    expect(values).not.toContain("0");
    expect(values).not.toContain("10");
  });

  it("shows a single saved drone count when an experiment is selected", () => {
    render(
      <ExperimentBar
        slug="foo"
        onSlugChange={() => {}}
        droneIds={["2", "3", "4"]}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Drone #" });
    expect(select).toHaveValue("4");
    expect(select).not.toHaveTextContent("2, 4");
    expect(screen.getByRole("option", { name: "2" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "4" })).toBeEnabled();
  });

  it("updates the single drone count when the experiment changes", () => {
    const { rerender } = render(
      <ExperimentBar slug="foo" onSlugChange={() => {}} droneIds={["2"]} />,
    );
    expect(screen.getByRole("combobox", { name: "Drone #" })).toHaveValue("2");

    rerender(
      <ExperimentBar
        slug="bar"
        onSlugChange={() => {}}
        droneIds={["2", "3", "4"]}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Drone #" })).toHaveValue("4");
  });

  it("clears the drone count when no experiment is selected", () => {
    const { rerender } = render(
      <ExperimentBar
        slug="foo"
        onSlugChange={() => {}}
        droneIds={["2", "3", "4"]}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Drone #" })).toHaveValue("4");
    rerender(
      <ExperimentBar slug={null} onSlugChange={() => {}} droneIds={["2", "3", "4"]} />,
    );
    expect(screen.getByRole("combobox", { name: "Drone #" })).toHaveValue("");
  });

  it("fills Name from the open experiment", () => {
    render(
      <ExperimentBar
        slug="foo"
        onSlugChange={() => {}}
        experimentName="Baseball"
      />,
    );

    expect(screen.getByLabelText("Name")).toHaveValue("Baseball");
  });

  it("clears Name when no experiment is selected", () => {
    const { rerender } = render(
      <ExperimentBar
        slug="foo"
        onSlugChange={() => {}}
        experimentName="Baseball"
      />,
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Baseball");
    rerender(
      <ExperimentBar slug={null} onSlugChange={() => {}} experimentName="Baseball" />,
    );
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("enables Update only with a slug and a name or drone number", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ExperimentBar slug={null} onSlugChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();

    rerender(<ExperimentBar slug="foo" onSlugChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();

    await user.selectOptions(screen.getByRole("combobox", { name: "Drone #" }), "4");
    expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();

    await user.selectOptions(screen.getByRole("combobox", { name: "Drone #" }), "");
    expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "Renamed");
    expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
  });

  it("selecting 4 notifies onDroneCountChange so the list can show four rows", async () => {
    const user = userEvent.setup();
    const onDroneCountChange = vi.fn();
    render(
      <ExperimentBar
        slug="foo"
        onSlugChange={() => {}}
        onDroneCountChange={onDroneCountChange}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Drone #" }), "4");

    expect(onDroneCountChange).toHaveBeenCalledWith(4);
    expect(addDrone).not.toHaveBeenCalled();
    expect(setDroneCount).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Drone #" })).toHaveValue("4");
  });

  it("click Update with 4 sets drone count to 4", async () => {
    const user = userEvent.setup();
    const onDronesChange = vi.fn();
    render(
      <ExperimentBar
        slug="foo"
        onSlugChange={() => {}}
        onDronesChange={onDronesChange}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Drone #" }), "4");
    await user.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(setDroneCount).toHaveBeenCalledTimes(1);
      expect(setDroneCount).toHaveBeenCalledWith("foo", 4);
      expect(onDronesChange).toHaveBeenCalled();
    });
    expect(addDrone).not.toHaveBeenCalled();
    expect(vi.mocked(setDroneCount).mock.invocationCallOrder[0]).toBeLessThan(
      onDronesChange.mock.invocationCallOrder[0],
    );
    expect(screen.getByRole("combobox", { name: "Drone #" })).toHaveValue("4");
  });

  it("click Update with 2 trims the count from the end", async () => {
    const user = userEvent.setup();
    const onDronesChange = vi.fn();
    render(
      <ExperimentBar
        slug="foo"
        onSlugChange={() => {}}
        droneIds={["1", "2", "3", "4"]}
        onDronesChange={onDronesChange}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Drone #" }), "2");
    await user.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(setDroneCount).toHaveBeenCalledWith("foo", 2);
      expect(onDronesChange).toHaveBeenCalled();
    });
    expect(addDrone).not.toHaveBeenCalled();
  });

  it("click Update writes the Name field to the experiment", async () => {
    const user = userEvent.setup();
    const onDronesChange = vi.fn();
    render(
      <ExperimentBar
        slug="foo"
        onSlugChange={() => {}}
        experimentName="Baseball"
        onDronesChange={onDronesChange}
      />,
    );

    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Practice");
    await user.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(patchManifest).toHaveBeenCalledWith("foo", { name: "Practice" });
      expect(onDronesChange).toHaveBeenCalled();
    });
    expect(addDrone).not.toHaveBeenCalled();
    expect(setDroneCount).not.toHaveBeenCalled();
  });

  it("click New with 4 selected sets drone count to 4", async () => {
    const user = userEvent.setup();
    const onSlugChange = vi.fn();
    const onDroneCountChange = vi.fn();
    render(
      <ExperimentBar
        slug={null}
        onSlugChange={onSlugChange}
        onDroneCountChange={onDroneCountChange}
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Practice");
    await user.selectOptions(screen.getByRole("combobox", { name: "Drone #" }), "4");
    await user.click(screen.getByRole("button", { name: "New" }));

    await waitFor(() => {
      expect(createExperiment).toHaveBeenCalledWith("Practice");
      expect(setDroneCount).toHaveBeenCalledTimes(1);
      expect(setDroneCount).toHaveBeenCalledWith("foo", 4);
      expect(onSlugChange).toHaveBeenCalledWith("foo");
    });
    expect(addDrone).not.toHaveBeenCalled();
    expect(vi.mocked(createExperiment).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(setDroneCount).mock.invocationCallOrder[0],
    );
  });

  it("keeps pending Drone # after a new empty experiment opens so Update can persist it", async () => {
    const user = userEvent.setup();
    const onDronesChange = vi.fn();
    const onDroneCountChange = vi.fn();
    const { rerender } = render(
      <ExperimentBar
        slug={null}
        onSlugChange={() => {}}
        onDronesChange={onDronesChange}
        onDroneCountChange={onDroneCountChange}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Drone #" }), "4");
    rerender(
      <ExperimentBar
        slug="foo"
        onSlugChange={() => {}}
        droneIds={[]}
        onDronesChange={onDronesChange}
        onDroneCountChange={onDroneCountChange}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Drone #" })).toHaveValue("4");
    await user.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(setDroneCount).toHaveBeenCalledWith("foo", 4);
      expect(onDronesChange).toHaveBeenCalled();
    });
    expect(addDrone).not.toHaveBeenCalled();
  });

  it("hides New, Drone #, and Update when showSetup is false", () => {
    render(
      <ExperimentBar slug="foo" onSlugChange={() => {}} showSetup={false} />,
    );

    expect(screen.getByLabelText("Experiment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Drone #" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rebuild" })).not.toBeInTheDocument();
  });
});
