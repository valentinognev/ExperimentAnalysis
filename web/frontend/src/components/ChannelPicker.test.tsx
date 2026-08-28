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

  it("empty search keeps branches collapsed", () => {
    render(
      <ChannelPicker
        nodes={nodes}
        selected={new Set()}
        onSelectedChange={() => {}}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "4" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "2.ulog" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "2.ulog.vehicle_local_position.x" })).not.toBeInTheDocument();
  });

  it("stays collapsed after nodes arrive", () => {
    const { rerender } = render(
      <ChannelPicker
        nodes={[]}
        selected={new Set()}
        onSelectedChange={() => {}}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    );
    rerender(
      <ChannelPicker
        nodes={nodes}
        selected={new Set()}
        onSelectedChange={() => {}}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("checkbox", { name: "4.ulog.vehicle_attitude.q[0]" })).not.toBeInTheDocument();
  });

  it("expanding a drone reveals sources so the tree can be walked", async () => {
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
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "2.ulog" }));
    await user.click(screen.getByRole("button", { name: "2.ulog.vehicle_local_position" }));
    expect(screen.getByRole("checkbox", { name: "2.ulog.vehicle_local_position.x" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "4.ulog" })).not.toBeInTheDocument();
  });

  it("expanding a multi-instance topic reveals .00/.01 then fields", async () => {
    const user = userEvent.setup();
    const instanceNodes = topicsToChannelTree({
      "2": {
        ulog: {
          "estimator_aid_src_gnss_pos.00": ["timestamp"],
          "estimator_aid_src_gnss_pos.01": ["timestamp"],
        },
      },
    });
    render(
      <ChannelPicker
        nodes={instanceNodes}
        selected={new Set()}
        onSelectedChange={() => {}}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "2.ulog" }));
    expect(screen.getByRole("button", { name: "2.ulog.estimator_aid_src_gnss_pos" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "2.ulog.estimator_aid_src_gnss_pos.00" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2.ulog.estimator_aid_src_gnss_pos" }));
    await user.click(screen.getByRole("button", { name: "2.ulog.estimator_aid_src_gnss_pos.00" }));
    expect(
      screen.getByRole("checkbox", { name: "2.ulog.estimator_aid_src_gnss_pos.00.timestamp" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "2.ulog.estimator_aid_src_gnss_pos.01.timestamp" }),
    ).not.toBeInTheDocument();
  });

  it("parent folder checkbox selects every instance's fields", async () => {
    const user = userEvent.setup();
    const onSelectedChange = vi.fn();
    const instanceNodes = topicsToChannelTree({
      "2": {
        ulog: {
          "estimator_aid_src_gnss_pos.00": ["timestamp"],
          "estimator_aid_src_gnss_pos.01": ["timestamp"],
        },
      },
    });
    render(
      <ChannelPicker
        nodes={instanceNodes}
        selected={new Set()}
        onSelectedChange={onSelectedChange}
        onApply={() => {}}
        onCancel={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "2.ulog" }));
    await user.click(screen.getByRole("checkbox", { name: "2.ulog.estimator_aid_src_gnss_pos" }));
    const next: Set<string> = onSelectedChange.mock.calls[0][0];
    expect([...next].sort()).toEqual([
      "2.ulog.estimator_aid_src_gnss_pos.00.timestamp",
      "2.ulog.estimator_aid_src_gnss_pos.01.timestamp",
    ]);
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
