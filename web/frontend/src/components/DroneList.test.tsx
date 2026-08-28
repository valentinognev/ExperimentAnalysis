// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
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
  browseFile: vi.fn(),
  importPaths: vi.fn(),
}));

import {
  pullDrone,
  rebuild,
  listSshLogs,
  copySshLogs,
  listMavlinkLogs,
  downloadMavlinkLog,
  browseFile,
  importPaths,
} from "../api";

describe("DroneList", () => {
  beforeEach(() => {
    vi.mocked(pullDrone).mockReset();
    vi.mocked(rebuild).mockReset();
    vi.mocked(listSshLogs).mockReset();
    vi.mocked(copySshLogs).mockReset();
    vi.mocked(listMavlinkLogs).mockReset();
    vi.mocked(downloadMavlinkLog).mockReset();
    vi.mocked(browseFile).mockReset();
    vi.mocked(importPaths).mockReset();
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
    const host = screen.getByLabelText("D2 host");
    const importBtn = screen.getByRole("button", { name: "Import" });
    const ssh = screen.getByRole("button", { name: "SSH" });
    expect(importBtn).toBeInTheDocument();
    expect(ssh).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MAVLink" })).toBeInTheDocument();
    expect(
      host.compareDocumentPosition(importBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      importBtn.compareDocumentPosition(ssh) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SSH" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "MAVLink" })).not.toBeInTheDocument();
  });

  it("analysis variant lists pose-source checkboxes for available avatars", async () => {
    const user = userEvent.setup();
    const onAvatarToggle = vi.fn();
    render(
      <DroneList
        variant="analysis"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        availableAvatars={{ "2": ["ekf_ned", "gps", "sm_ned"] }}
        enabledAvatars={{ "2": ["ekf_ned", "gps"] }}
        onAvatarToggle={onAvatarToggle}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "D2 ekf" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "D2 gps" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "D2 sm ned" })).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "D2 sm lla" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "D2 sm ned" }));
    expect(onAvatarToggle).toHaveBeenCalledWith("2", "sm_ned", true);
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

  it("SSH picker sorts by ulg time and prechecks the closest SM and HA", async () => {
    vi.mocked(listSshLogs).mockResolvedValue({
      ok: true,
      logs: [
        {
          kind: "sm",
          name: "2026-07-19_22-33-25_system_manager.csv",
          remote: "~/RL/system_manager/logs/2026-07-19_22-33-25_system_manager.csv",
          size: 1,
          mtime: "2026/07/19 22:33:25",
        },
        {
          kind: "sm",
          name: "2026-08-25_17-00-00_system_manager.csv",
          remote: "~/RL/system_manager/logs/2026-08-25_17-00-00_system_manager.csv",
          size: 2,
          mtime: "2026/08/25 17:00:00",
        },
        {
          kind: "ha",
          name: "2026-08-25_17-06-00_adapter_diag.log",
          remote: "~/RL/logs/2026-08-25_17-06-00_adapter_diag.log",
          size: 3,
          mtime: "2026/08/25 17:06:00",
        },
      ],
    });

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        summaries={{
          "2": {
            ulg: "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg",
            ulgOrigin: "",
            date: "2026-08-25",
            time: "17:05:30",
            sm: [],
            ha: [],
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "SSH" }));
    const dialog = await screen.findByRole("dialog", { name: /SSH logs/i });
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes[0]).toHaveAccessibleName(/2026-08-25_17-06-00_adapter_diag/);
    expect(
      within(dialog).getByRole("checkbox", { name: /2026-08-25_17-00-00_system_manager/ }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("checkbox", { name: /2026-08-25_17-06-00_adapter_diag/ }),
    ).toBeChecked();
    expect(boxes[boxes.length - 1]).toHaveAccessibleName(/2026-07-19_22-33-25_system_manager/);
    expect(boxes[boxes.length - 1]).not.toBeChecked();
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

  it("Import opens a dialog; Browse fills the path and does not import", async () => {
    const user = userEvent.setup();
    vi.mocked(browseFile).mockResolvedValue({ path: "/tmp/d2.ulg" });

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Import" }));
    const dialog = screen.getByRole("dialog", { name: "Import files" });
    const pathInput = screen.getByPlaceholderText("path to .ulg or log file");
    expect(pathInput).toHaveValue("");
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(pathInput).toHaveValue("/tmp/d2.ulg");
    });
    expect(browseFile).toHaveBeenCalledWith(undefined);
    expect(importPaths).not.toHaveBeenCalled();
    expect(rebuild).not.toHaveBeenCalled();
  });

  it("Browse sits to the left of the import path field", async () => {
    const user = userEvent.setup();
    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Import" }));
    const dialog = screen.getByRole("dialog", { name: "Import files" });
    const browse = within(dialog).getByRole("button", { name: "Browse" });
    const pathInput = screen.getByPlaceholderText("path to .ulg or log file");
    expect(browse.compareDocumentPosition(pathInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("Import path prefills with the existing ulg origin", async () => {
    const user = userEvent.setup();
    const origin =
      "/home/valentin/RL/TESTFLIGHTS/Baseball/Group3RLcat2_log_41_2026-8-25-17-05-30.ulg";
    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        summaries={{
          "2": {
            ulg: "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg",
            ulgOrigin: origin,
            date: "2026-08-25",
            time: "17:05:30",
            sm: [],
            ha: [],
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByPlaceholderText("path to .ulg or log file")).toHaveValue(origin);

    vi.mocked(browseFile).mockResolvedValue({ path: null });
    await user.click(within(screen.getByRole("dialog", { name: "Import files" })).getByRole("button", { name: "Browse" }));
    expect(browseFile).toHaveBeenCalledWith(origin);
  });

  it("Browse cancel leaves the path and does not import", async () => {
    const user = userEvent.setup();
    vi.mocked(browseFile).mockResolvedValue({ path: null });

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Import" }));
    const dialog = screen.getByRole("dialog", { name: "Import files" });
    const pathInput = screen.getByPlaceholderText("path to .ulg or log file");
    await user.type(pathInput, "/already/there");

    await user.click(within(dialog).getByRole("button", { name: "Browse" }));

    await waitFor(() => {
      expect(browseFile).toHaveBeenCalledWith("/already/there");
    });
    expect(pathInput).toHaveValue("/already/there");
    expect(importPaths).not.toHaveBeenCalled();
    expect(rebuild).not.toHaveBeenCalled();
  });

  it("Import panel sits inside that drone row, not after the list", async () => {
    const user = userEvent.setup();
    render(
      <DroneList
        variant="sources"
        droneIds={["2", "3"]}
        visible={new Set(["2", "3"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Import" })[0]);
    const items = screen.getAllByRole("listitem");
    expect(
      within(items[0]).getByRole("dialog", { name: "Import files" }),
    ).toBeInTheDocument();
    expect(within(items[1]).queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("SSH picker sits inside that drone row, not after the list", async () => {
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
    const dialog = await screen.findByRole("dialog", { name: /SSH logs/i });
    const d2 = screen.getByLabelText("D2 host").closest("li");
    const d3 = screen.getByLabelText("D3 host").closest("li");
    expect(d2).toContainElement(dialog);
    expect(d3).not.toContainElement(dialog);
  });

  it("MAVLink picker sits inside that drone row, not after the list", async () => {
    const user = userEvent.setup();
    vi.mocked(listMavlinkLogs).mockResolvedValue({
      ok: true,
      logs: [{ id: 1, time_utc: 0, size: 10 }],
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

    await user.click(screen.getAllByRole("button", { name: "MAVLink" })[0]);
    await user.click(screen.getByRole("menuitem", { name: "TCP" }));
    const dialog = await screen.findByRole("dialog", { name: /MAVLink logs/i });
    const d2 = screen.getByLabelText("D2 host").closest("li");
    const d3 = screen.getByLabelText("D3 host").closest("li");
    expect(d2).toContainElement(dialog);
    expect(d3).not.toContainElement(dialog);
  });

  it("Import path field fills the space after Browse", async () => {
    const user = userEvent.setup();
    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Import" }));
    const pathInput = screen.getByPlaceholderText("path to .ulg or log file");
    expect(pathInput.className).toMatch(/\bflex-1\b/);
    expect(pathInput.className).not.toMatch(/\bw-full\b/);
  });

  it("Import posts importPaths with drone id 2, then rebuild, then onPulled", async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    vi.mocked(importPaths).mockImplementation(async () => {
      order.push("import");
      return { ok: true };
    });
    vi.mocked(rebuild).mockImplementation(async () => {
      order.push("rebuild");
      return { ok: true };
    });
    const onPulled = vi.fn(() => {
      order.push("pulled");
    });

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        onPulled={onPulled}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Import" }));
    const dialog = screen.getByRole("dialog", { name: "Import files" });
    await user.type(
      screen.getByPlaceholderText("path to .ulg or log file"),
      "/tmp/d2.ulg",
    );
    await user.click(within(dialog).getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(importPaths).toHaveBeenCalledWith(
        "Baseball",
        ["/tmp/d2.ulg"],
        undefined,
        2,
      );
      expect(rebuild).toHaveBeenCalledWith("Baseball");
      expect(onPulled).toHaveBeenCalled();
    });
    expect(order).toEqual(["import", "rebuild", "pulled"]);
    expect(screen.queryByRole("dialog", { name: "Import files" })).not.toBeInTheDocument();
  });

  it("import of many SM files opens a picker ranked by ulg time", async () => {
    const user = userEvent.setup();
    vi.mocked(importPaths)
      .mockResolvedValueOnce({
        ok: true,
        needs_pick: [
          {
            path: "/logs/2026-07-19_22-33-25_system_manager.csv",
            name: "2026-07-19_22-33-25_system_manager.csv",
            kind: "sm",
            size: 10,
          },
          {
            path: "/logs/2026-08-25_17-00-00_system_manager.csv",
            name: "2026-08-25_17-00-00_system_manager.csv",
            kind: "sm",
            size: 20,
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, needs_pick: [] });
    vi.mocked(rebuild).mockResolvedValue({ ok: true });
    const onPulled = vi.fn();

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        onPulled={onPulled}
        summaries={{
          "2": {
            ulg: "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg",
            ulgOrigin: "",
            date: "2026-08-25",
            time: "17:05:30",
            sm: [],
            ha: [],
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Import" }));
    const importDialog = screen.getByRole("dialog", { name: "Import files" });
    await user.type(
      screen.getByPlaceholderText("path to .ulg or log file"),
      "/logs",
    );
    await user.click(within(importDialog).getByRole("button", { name: "Import" }));

    const picker = await screen.findByRole("dialog", { name: /Import logs/i });
    expect(rebuild).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Import files" })).not.toBeInTheDocument();

    const boxes = within(picker).getAllByRole("checkbox");
    expect(boxes[0]).toHaveAccessibleName(/2026-08-25_17-00-00_system_manager/);
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).toHaveAccessibleName(/2026-07-19_22-33-25_system_manager/);
    expect(boxes[1]).not.toBeChecked();

    await user.click(within(picker).getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(importPaths).toHaveBeenLastCalledWith(
        "Baseball",
        ["/logs/2026-08-25_17-00-00_system_manager.csv"],
        undefined,
        2,
      );
      expect(rebuild).toHaveBeenCalledWith("Baseball");
      expect(onPulled).toHaveBeenCalled();
    });
  });

  it("still passes droneId when the path is a mixed folder", async () => {
    const user = userEvent.setup();
    vi.mocked(importPaths).mockResolvedValue({ ok: true });
    vi.mocked(rebuild).mockResolvedValue({ ok: true });

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Import" }));
    const dialog = screen.getByRole("dialog", { name: "Import files" });
    await user.type(
      screen.getByPlaceholderText("path to .ulg or log file"),
      "/home/logs",
    );
    await user.click(within(dialog).getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(importPaths).toHaveBeenCalledWith(
        "Baseball",
        ["/home/logs"],
        undefined,
        2,
      );
    });
  });

  it("shows a row error when import fails", async () => {
    const user = userEvent.setup();
    vi.mocked(importPaths).mockRejectedValue(new Error("disk full"));

    render(
      <DroneList
        variant="sources"
        droneIds={["2", "3"]}
        visible={new Set(["2", "3"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Import" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Import files" });
    await user.type(
      screen.getByPlaceholderText("path to .ulg or log file"),
      "/tmp/d2.ulg",
    );
    await user.click(within(dialog).getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("disk full");
    });
    expect(rebuild).not.toHaveBeenCalled();
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("disk full");
    expect(rows[1]).not.toHaveTextContent("disk full");
  });

  it("opening Import closes SSH and MAVLink pickers", async () => {
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
    vi.mocked(listMavlinkLogs).mockResolvedValue({
      ok: true,
      logs: [{ id: 1, time_utc: 0, size: 10 }],
    });

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "SSH" }));
    await waitFor(() => screen.getByRole("dialog", { name: /SSH logs/i }));
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.queryByRole("dialog", { name: /SSH logs/i })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Import files" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "MAVLink" }));
    await user.click(screen.getByRole("menuitem", { name: "TCP" }));
    await waitFor(() => screen.getByRole("dialog", { name: /MAVLink logs/i }));
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.queryByRole("dialog", { name: /MAVLink logs/i })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Import files" })).toBeInTheDocument();
  });

  it("opening SSH or MAVLink closes the import panel", async () => {
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
    vi.mocked(listMavlinkLogs).mockResolvedValue({
      ok: true,
      logs: [{ id: 1, time_utc: 0, size: 10 }],
    });

    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByRole("dialog", { name: "Import files" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SSH" }));
    expect(screen.queryByRole("dialog", { name: "Import files" })).not.toBeInTheDocument();

    await waitFor(() => screen.getByRole("dialog", { name: /SSH logs/i }));
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByRole("dialog", { name: "Import files" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "MAVLink" }));
    await user.click(screen.getByRole("menuitem", { name: "TCP" }));
    expect(screen.queryByRole("dialog", { name: "Import files" })).not.toBeInTheDocument();
  });

  it("sources variant shows a per-drone summary of files, stamp, and color", () => {
    render(
      <DroneList
        variant="sources"
        droneIds={["1", "2"]}
        visible={new Set(["1", "2"])}
        onToggle={() => {}}
        slug="Baseball"
        hosts={{ "2": "192.168.31.30" }}
        summaries={{
          "2": {
            ulg: "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg",
            ulgOrigin: "",
            date: "2026-08-25",
            time: "17:05:30",
            sm: ["20260825_system_manager_d2.csv"],
            ha: ["adapter_diag_d2.log"],
          },
        }}
      />,
    );

    const d2 = screen.getByLabelText("D2 sources");
    expect(d2).toHaveTextContent("Group3RLcat2_log_41_2026-8-25-17-05-30.ulg");
    expect(d2).toHaveTextContent("2026-08-25");
    expect(d2).toHaveTextContent("17:05:30");
    expect(d2).toHaveTextContent("20260825_system_manager_d2.csv");
    expect(d2).toHaveTextContent("adapter_diag_d2.log");
    expect(screen.getByLabelText("D2 color")).toHaveStyle({
      backgroundColor: "rgb(0, 140, 255)",
    });

    const d1 = screen.getByLabelText("D1 sources");
    expect(d1).toHaveTextContent("—");
  });

  it("lists SM files one per line, not a comma wall", () => {
    render(
      <DroneList
        variant="sources"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        summaries={{
          "2": {
            ulg: "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg",
            ulgOrigin: "",
            date: "2026-08-25",
            time: "17:05:30",
            sm: [
              "2026-07-19_22-33-25_system_manager.csv",
              "2026-08-25_17-00-00_system_manager.csv",
            ],
            ha: ["a_adapter_diag.log", "b_mavlink.txt"],
          },
        }}
      />,
    );

    const d2 = screen.getByLabelText("D2 sources");
    expect(d2).not.toHaveTextContent(
      "2026-07-19_22-33-25_system_manager.csv, 2026-08-25_17-00-00_system_manager.csv",
    );
    const sm = within(d2).getByLabelText("D2 SM files");
    expect(within(sm).getAllByRole("listitem").map((el) => el.textContent)).toEqual([
      "2026-07-19_22-33-25_system_manager.csv",
      "2026-08-25_17-00-00_system_manager.csv",
    ]);
    const ha = within(d2).getByLabelText("D2 HA files");
    expect(within(ha).getAllByRole("listitem").map((el) => el.textContent)).toEqual([
      "a_adapter_diag.log",
      "b_mavlink.txt",
    ]);
  });

  it("analysis variant does not show source summaries", () => {
    render(
      <DroneList
        variant="analysis"
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        summaries={{
          "2": {
            ulg: "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg",
            ulgOrigin: "",
            date: "2026-08-25",
            time: "17:05:30",
            sm: [],
            ha: [],
          },
        }}
      />,
    );
    expect(screen.queryByLabelText("D2 sources")).not.toBeInTheDocument();
  });
});
