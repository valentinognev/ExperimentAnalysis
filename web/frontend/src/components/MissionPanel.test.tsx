// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import MissionPanel from "./MissionPanel";

describe("MissionPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the command fields and updates when the snapshot changes", () => {
    const { rerender } = render(
      <MissionPanel
        mission={{
          mission_type: 0,
          mission_label: "NONE",
          vmax: 1,
          altitude_m: 1,
          delta_m: 0,
          radius_m: 2,
          heading_deg: 0,
          dest_x_m: 0.5,
          dest_y_m: 0,
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Mission" })).toBeInTheDocument();
    expect(screen.getByText("NONE")).toBeInTheDocument();
    expect(screen.getByLabelText("Vmax")).toHaveTextContent("1");
    expect(screen.getByLabelText("Δ")).toHaveTextContent("0 m");
    expect(screen.getByLabelText("R")).toHaveTextContent("2");
    expect(screen.getByLabelText("Dest X")).toHaveTextContent("0.5");
    expect(screen.getByLabelText("Dest Y")).toHaveTextContent("0");
    rerender(
      <MissionPanel
        mission={{
          mission_type: 1,
          mission_label: "Formation NN",
          vmax: 3,
          altitude_m: 1,
          delta_m: 0,
          radius_m: 4,
          heading_deg: 0,
          dest_x_m: 0.5,
          dest_y_m: 1,
        }}
      />,
    );
    expect(screen.getByText("Formation NN")).toBeInTheDocument();
    expect(screen.getByLabelText("Vmax")).toHaveTextContent("3");
    expect(screen.getByLabelText("R")).toHaveTextContent("4");
    expect(screen.getByLabelText("Dest Y")).toHaveTextContent("1");
  });

  it("renders nothing without a log", () => {
    const { container } = render(<MissionPanel mission={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a dash for a field not commanded yet", () => {
    render(
      <MissionPanel
        mission={{
          mission_type: null,
          mission_label: null,
          vmax: null,
          altitude_m: null,
          delta_m: null,
          radius_m: null,
          heading_deg: null,
          dest_x_m: null,
          dest_y_m: null,
        }}
      />,
    );
    expect(screen.getByLabelText("Vmax")).toHaveTextContent("—");
  });
});
