// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import DroneList from "./DroneList";

vi.mock("../api", () => ({
  pullDrone: vi.fn(),
  rebuild: vi.fn(),
  listSshLogs: vi.fn(),
  copySshLogs: vi.fn(),
  listMavlinkLogs: vi.fn(),
  downloadMavlinkLog: vi.fn(),
}));

import {
  pullDrone,
  rebuild,
  listSshLogs,
  copySshLogs,
  listMavlinkLogs,
  downloadMavlinkLog,
} from "../api";

describe("DroneList", () => {
  beforeEach(() => {
    vi.mocked(pullDrone).mockReset();
    vi.mocked(rebuild).mockReset();
    vi.mocked(listSshLogs).mockReset();
    vi.mocked(copySshLogs).mockReset();
    vi.mocked(listMavlinkLogs).mockReset();
    vi.mocked(downloadMavlinkLog).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("sources variant shows host and pull, not visibility checkboxes", () => {
    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        hosts={{ "2": "192.168.31.30" }}
      />,
    );

    expect(screen.getByLabelText("D2 host")).toHaveValue("192.168.31.30");
    expect(screen.getByRole("button", { name: "SSH" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("analysis variant shows visibility checkboxes, not host or pull", () => {
    render(
      <DroneList
        variant="analysis"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        hosts={{ "2": "192.168.31.30" }}
      />,
    );

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.queryByLabelText("D2 host")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SSH" })).not.toBeInTheDocument();
  });

  it("lists Pi logs then copies the selected file", async () => {
    const user = userEvent.setup();
    vi.mocked(listSshLogs).mockResolvedValue({
      ok: true,
      logs: [
        {
          kind: "sm",
          name: "20260825_system_manager_d2.csv",
          remote: "~/RL/system_manager/logs/20260825_system_manager_d2.csv",
          size: 12345,
          mtime: "2026/08/25 17:05:30",
        },
        {
          kind: "ha",
          name: "20260825_adapter_diag.log",
          remote: "~/RL/logs/20260825_adapter_diag.log",
          size: 500,
          mtime: "2026/08/25 17:06:00",
        },
      ],
    });
    vi.mocked(copySshLogs).mockResolvedValue({ ok: true });
    vi.mocked(rebuild).mockResolvedValue({ ok: true });

    const onPulled = vi.fn();
    render(
      <DroneList
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        onPulled={onPulled}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "SSH" }));

    await waitFor(() => {
      expect(listSshLogs).toHaveBeenCalledWith("Baseball", 2);
      expect(screen.getByRole("dialog", { name: /SSH logs/i })).toBeInTheDocument();
    });
    expect(copySshLogs).not.toHaveBeenCalled();
    expect(rebuild).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: /20260825_system_manager_d2/ }));
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(copySshLogs).toHaveBeenCalledWith(
        "Baseball",
        2,
        [
          {
            remote: "~/RL/system_manager/logs/20260825_system_manager_d2.csv",
            name: "20260825_system_manager_d2.csv",
            size: 12345,
          },
        ],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(rebuild).toHaveBeenCalledWith("Baseball");
      expect(onPulled).toHaveBeenCalled();
    });
  });

  it("shows copy progress and Cancel aborts the transfer", async () => {
    const user = userEvent.setup();
    vi.mocked(listSshLogs).mockResolvedValue({
      ok: true,
      logs: [
        {
          kind: "sm",
          name: "20260825_system_manager_d2.csv",
          remote: "~/RL/system_manager/logs/20260825_system_manager_d2.csv",
          size: 12345,
          mtime: "2026/08/25 17:05:30",
        },
      ],
    });
    vi.mocked(copySshLogs).mockImplementation((_slug, _id, _files, opts) => {
      opts?.onProgress?.({
        name: "20260825_system_manager_d2.csv",
        index: 1,
        count: 1,
        bytes: 6172,
        total: 12345,
        pct: 50,
      });
      return new Promise((resolve) => {
        opts?.signal?.addEventListener("abort", () => {
          resolve({ ok: false, cancelled: true });
        });
      });
    });

    render(
      <DroneList
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "SSH" }));
    await waitFor(() => screen.getByRole("dialog", { name: /SSH logs/i }));
    await user.click(screen.getByRole("checkbox", { name: /20260825_system_manager_d2/ }));
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toHaveTextContent("50%");
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(rebuild).not.toHaveBeenCalled();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows progress as soon as Copy starts, before any stream event", async () => {
    const user = userEvent.setup();
    vi.mocked(listSshLogs).mockResolvedValue({
      ok: true,
      logs: [
        {
          kind: "sm",
          name: "20260825_system_manager_d2.csv",
          remote: "~/RL/system_manager/logs/20260825_system_manager_d2.csv",
          size: 12345,
          mtime: "2026/08/25 17:05:30",
        },
      ],
    });
    vi.mocked(copySshLogs).mockImplementation(() => new Promise(() => {}));

    render(
      <DroneList
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "SSH" }));
    await waitFor(() => screen.getByRole("dialog", { name: /SSH logs/i }));
    await user.click(screen.getByRole("checkbox", { name: /20260825_system_manager_d2/ }));
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toHaveTextContent("0%");
      expect(screen.getByRole("progressbar")).toHaveTextContent(
        "20260825_system_manager_d2.csv",
      );
    });
    const dialog = screen.getByRole("dialog", { name: /SSH logs/i });
    const bar = screen.getByRole("progressbar");
    const list = dialog.querySelector("ul");
    expect(list).toBeTruthy();
    expect(
      bar.compareDocumentPosition(list as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows progress as soon as Download starts, before any stream event", async () => {
    const user = userEvent.setup();
    vi.mocked(listMavlinkLogs).mockResolvedValue({
      ok: true,
      logs: [{ id: 4, time_utc: 0, size: 99 }],
    });
    vi.mocked(downloadMavlinkLog).mockImplementation(() => new Promise(() => {}));

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    await user.click(screen.getByRole("button", { name: "MAVLink" }));
    await user.click(screen.getByRole("menuitem", { name: "TCP" }));
    await waitFor(() => screen.getByRole("dialog", { name: /MAVLink logs/i }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toHaveTextContent("0%");
      expect(screen.getByRole("progressbar")).toHaveTextContent("log_4");
    });
  });

  it("keeps picker open at 100% while rebuilding after copy", async () => {
    const user = userEvent.setup();
    vi.mocked(listSshLogs).mockResolvedValue({
      ok: true,
      logs: [
        {
          kind: "sm",
          name: "20260825_system_manager_d2.csv",
          remote: "~/RL/system_manager/logs/20260825_system_manager_d2.csv",
          size: 12345,
          mtime: "2026/08/25 17:05:30",
        },
      ],
    });
    vi.mocked(copySshLogs).mockResolvedValue({ ok: true });
    let finishRebuild: () => void = () => {};
    vi.mocked(rebuild).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRebuild = () => resolve({ ok: true });
        }),
    );

    render(
      <DroneList
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "SSH" }));
    await waitFor(() => screen.getByRole("dialog", { name: /SSH logs/i }));
    await user.click(screen.getByRole("checkbox", { name: /20260825_system_manager_d2/ }));
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(rebuild).toHaveBeenCalledWith("Baseball");
      expect(screen.getByRole("dialog", { name: /SSH logs/i })).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toHaveTextContent("100%");
      expect(screen.getByText(/Rebuilding/i)).toBeInTheDocument();
    });
    finishRebuild();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /SSH logs/i })).not.toBeInTheDocument();
    });
  });

  it("renders each drone as its own list row", () => {
    render(
      <DroneList
        variant="sources"
        droneIds={["2", "3", "4"]}
        visible={new Set(["2", "3", "4"])}
        onToggle={() => {}}
        slug="Baseball"
        hosts={{ "2": "192.168.31.30", "3": "", "4": "192.168.31.152" }}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("D2");
    expect(rows[1]).toHaveTextContent("D3");
    expect(rows[2]).toHaveTextContent("D4");
  });

  it("shows per-drone host fields, prefills seeds, empty when unset", () => {
    render(
      <DroneList
        droneIds={["2", "3"]}
        visible={new Set(["2", "3"])}
        onToggle={() => {}}
        slug="Baseball"
        hosts={{ "2": "192.168.31.30", "3": "" }}
      />,
    );

    expect(screen.getByLabelText("D2 host")).toHaveValue("192.168.31.30");
    expect(screen.getByLabelText("D3 host")).toHaveValue("");
  });

  it("commits host on blur and Enter, not on each keystroke", async () => {
    const user = userEvent.setup();
    const onHostCommit = vi.fn();
    render(
      <DroneList
        droneIds={["3"]}
        visible={new Set(["3"])}
        onToggle={() => {}}
        slug="Baseball"
        hosts={{ "3": "" }}
        onHostCommit={onHostCommit}
      />,
    );

    const input = screen.getByLabelText("D3 host");
    await user.type(input, "10.0.0.3");
    expect(onHostCommit).not.toHaveBeenCalled();
    await user.tab();
    expect(onHostCommit).toHaveBeenCalledWith("3", "10.0.0.3");

    onHostCommit.mockClear();
    await user.clear(input);
    await user.type(input, "10.0.0.4{Enter}");
    expect(onHostCommit).toHaveBeenCalledWith("3", "10.0.0.4");
  });

  it("SSH is green when Pi logs are already in the experiment", () => {
    render(
      <DroneList
        variant="sources"
        droneIds={["2", "3"]}
        visible={new Set(["2", "3"])}
        onToggle={() => {}}
        slug="Baseball"
        sshReady={{ "2": true, "3": false }}
      />,
    );

    const sshButtons = screen.getAllByRole("button", { name: "SSH" });
    expect(sshButtons[0]).toHaveClass("bg-green-700");
    expect(sshButtons[1]).not.toHaveClass("bg-green-700");
  });

  it("shows a note on the drone row when SSH pull fails", async () => {
    vi.mocked(listSshLogs).mockResolvedValue({
      ok: false,
      error: "ssh timeout",
    });

    render(
      <DroneList
        variant="sources"
        droneIds={["2", "3"]}
        visible={new Set(["2", "3"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "SSH" })[0]);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("ssh timeout");
    });
    expect(rebuild).not.toHaveBeenCalled();
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("ssh timeout");
    expect(rows[1]).not.toHaveTextContent("ssh timeout");
  });

  it("turns SSH green after a successful pull", async () => {
    const user = userEvent.setup();
    vi.mocked(listSshLogs).mockResolvedValue({
      ok: true,
      logs: [
        {
          kind: "sm",
          name: "20260825_system_manager_d2.csv",
          remote: "~/RL/system_manager/logs/20260825_system_manager_d2.csv",
          size: 1,
          mtime: "2026/08/25 17:05:30",
        },
      ],
    });
    vi.mocked(copySshLogs).mockResolvedValue({ ok: true });
    vi.mocked(rebuild).mockResolvedValue({ ok: true });

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        sshReady={{ "2": false }}
      />,
    );

    const ssh = screen.getByRole("button", { name: "SSH" });
    expect(ssh).not.toHaveClass("bg-green-700");
    fireEvent.click(ssh);

    await waitFor(() => screen.getByRole("dialog", { name: /SSH logs/i }));
    await user.click(screen.getByRole("checkbox", { name: /20260825_system_manager_d2/ }));
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "SSH" })).toHaveClass("bg-green-700");
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("MAVLink menu offers TCP and Serial, then lists logs to pick", async () => {
    const user = userEvent.setup();
    vi.mocked(listMavlinkLogs).mockResolvedValue({
      ok: true,
      logs: [
        { id: 1, time_utc: 0, size: 10 },
        { id: 4, time_utc: 0, size: 99 },
      ],
    });
    vi.mocked(downloadMavlinkLog).mockResolvedValue({ ok: true });
    vi.mocked(rebuild).mockResolvedValue({ ok: true });
    const onPulled = vi.fn();

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        hosts={{ "2": "192.168.31.30" }}
        onPulled={onPulled}
      />,
    );

    await user.click(screen.getByRole("button", { name: "MAVLink" }));
    await user.click(screen.getByRole("menuitem", { name: "TCP" }));

    await waitFor(() => {
      expect(listMavlinkLogs).toHaveBeenCalledWith("Baseball", 2, "tcp", undefined);
      expect(screen.getByRole("dialog", { name: /MAVLink logs/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("radio", { name: /#4/ }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(downloadMavlinkLog).toHaveBeenCalledWith(
        "Baseball",
        2,
        4,
        "tcp",
        false,
        undefined,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(rebuild).toHaveBeenCalled();
      expect(onPulled).toHaveBeenCalled();
    });
  });

  it("asks before replacing an existing ulg and skips download on cancel", async () => {
    const user = userEvent.setup();
    vi.mocked(listMavlinkLogs).mockResolvedValue({
      ok: true,
      logs: [{ id: 1, time_utc: 0, size: 10 }],
    });
    vi.mocked(downloadMavlinkLog).mockResolvedValue({
      ok: false,
      needs_replace: true,
      existing: "raw/drone_2/old.ulg",
    });
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    await user.click(screen.getByRole("button", { name: "MAVLink" }));
    await user.click(screen.getByRole("menuitem", { name: "TCP" }));
    await waitFor(() => screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(downloadMavlinkLog).toHaveBeenCalledTimes(1);
      expect(confirm).toHaveBeenCalled();
    });
    expect(rebuild).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("downloads after the operator accepts ulg replacement", async () => {
    const user = userEvent.setup();
    vi.mocked(listMavlinkLogs).mockResolvedValue({
      ok: true,
      logs: [{ id: 1, time_utc: 0, size: 10 }],
    });
    vi.mocked(downloadMavlinkLog)
      .mockResolvedValueOnce({
        ok: false,
        needs_replace: true,
        existing: "raw/drone_2/old.ulg",
      })
      .mockResolvedValueOnce({ ok: true });
    vi.mocked(rebuild).mockResolvedValue({ ok: true });
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    await user.click(screen.getByRole("button", { name: "MAVLink" }));
    await user.click(screen.getByRole("menuitem", { name: "TCP" }));
    await waitFor(() => screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(downloadMavlinkLog).toHaveBeenCalledTimes(2);
      expect(downloadMavlinkLog).toHaveBeenLastCalledWith(
        "Baseball",
        2,
        1,
        "tcp",
        true,
        undefined,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(rebuild).toHaveBeenCalled();
    });
    vi.unstubAllGlobals();
  });
});
