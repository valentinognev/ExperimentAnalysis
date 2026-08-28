// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import ChannelPicker from "./ChannelPicker";
import { topicsToChannelTree } from "../plotBoard";

const nodes = topicsToChannelTree({
  "2": {
    ulog: { vehicle_local_position: ["x", "y"] },
    sm: { sm_system_manager: ["state"] },
  },
  "4": { ulog: { vehicle_attitude: ["q[0]"] } },
});

describe("ChannelPicker", () => {
  afterEach(() => cleanup());

  it("hides fields until their topic is expanded", async () => {
    const user = userEvent.setup();
    render(
      <ChannelPicker
        nodes={nodes}
        selected={new Set()}
        onSelectedChange={() => {}}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByRole("checkbox", { name: "2.ulog.vehicle_local_position.x" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "2.ulog" }));
    await user.click(screen.getByRole("button", { name: "2.ulog.vehicle_local_position" }));
    expect(screen.getByRole("checkbox", { name: "2.ulog.vehicle_local_position.x" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "4.ulog.vehicle_attitude.q[0]" })).not.toBeInTheDocument();
  });

  it("search filters to matching channel ids and expands matches", async () => {
    const user = userEvent.setup();
    render(
      <ChannelPicker
        nodes={nodes}
        selected={new Set()}
        onSelectedChange={() => {}}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    );
    await user.type(screen.getByRole("searchbox", { name: "Search channels" }), "attitude");
    expect(screen.getByRole("checkbox", { name: "4.ulog.vehicle_attitude.q[0]" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "2.ulog.vehicle_local_position.x" })).not.toBeInTheDocument();
  });

  it("folder checkbox selects all descendant leaves", async () => {
    const user = userEvent.setup();
    const onSelectedChange = vi.fn();
    render(
      <ChannelPicker
        nodes={nodes}
        selected={new Set()}
        onSelectedChange={onSelectedChange}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "2.ulog" }));
    await user.click(screen.getByRole("checkbox", { name: "2.ulog.vehicle_local_position" }));
    const next: Set<string> = onSelectedChange.mock.calls[0][0];
    expect([...next].sort()).toEqual([
      "2.ulog.vehicle_local_position.x",
      "2.ulog.vehicle_local_position.y",
    ]);
  });

  it("Apply stays disabled until a channel is selected, then calls onApply", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const { rerender } = render(
      <ChannelPicker
        nodes={nodes}
        selected={new Set()}
        onSelectedChange={() => {}}
        onApply={onApply}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    rerender(
      <ChannelPicker
        nodes={nodes}
        selected={new Set(["2.ulog.vehicle_local_position.x"])}
        onSelectedChange={() => {}}
        onApply={onApply}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("marks a folder checkbox indeterminate when some descendants are selected", () => {
    render(
      <ChannelPicker
        nodes={nodes}
        selected={new Set(["2.ulog.vehicle_local_position.x"])}
        onSelectedChange={() => {}}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "2" })).toBePartiallyChecked();
  });
});
