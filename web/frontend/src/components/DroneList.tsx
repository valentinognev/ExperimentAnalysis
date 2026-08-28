import { useEffect, useRef, useState } from "react";
import {
  browseFolder,
  copySshLogs,
  downloadMavlinkLog,
  importPaths,
  listMavlinkLogs,
  listSshLogs,
  rebuild,
  type MavlinkTransport,
} from "../api";
import { mavlinkLogLabel, type MavlinkLogEntry } from "../mavlinkLogs";
import { sshLogLabel, type SshLogEntry } from "../sshLogs";
import { transferProgressLabel, type TransferProgress } from "../transferProgress";
import { droneColor } from "../droneColor";
import { type DroneSummary } from "../droneSummary";

const EMPTY_HOSTS: Record<string, string> = {};
const EMPTY_READY: Record<string, boolean> = {};
const EMPTY_SUMMARIES: Record<string, DroneSummary> = {};
const EMPTY_SUMMARY: DroneSummary = {
  ulg: "—",
  date: "—",
  time: "—",
  sm: [],
  ha: [],
};
const SERIAL_DEFAULT = "/dev/ttyUSB0";

const SSH_IDLE =
  "rounded border border-zinc-700 px-1.5 py-0.5 text-xs hover:bg-zinc-800 disabled:opacity-50";
const SSH_READY =
  "rounded border border-green-600 bg-green-700 px-1.5 py-0.5 text-xs text-white hover:bg-green-600 disabled:opacity-50";
const BTN =
  "rounded border border-zinc-700 px-1.5 py-0.5 text-xs hover:bg-zinc-800 disabled:opacity-50";

function TransferBar({
  progress,
  rebuilding,
}: {
  progress: TransferProgress;
  rebuilding?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Number(progress.pct) || 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="mb-2 text-xs text-zinc-300"
    >
      <div className="mb-1 h-2 w-full overflow-hidden rounded bg-zinc-800">
        <div className="h-full bg-green-600" style={{ width: `${pct}%` }} />
      </div>
      {transferProgressLabel(progress)}
      {rebuilding ? "  Rebuilding…" : ""}
    </div>
  );
}

type SshPicker = {
  droneId: string;
  logs: SshLogEntry[];
  selected: string[];
};

type Picker = {
  droneId: string;
  transport: MavlinkTransport;
  serial?: string;
  logs: MavlinkLogEntry[];
  selected: number;
};

type ImportPanel = {
  droneId: string;
  path: string;
};

type Props = {
  droneIds: string[];
  visible: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  slug: string | null;
  onPulled?: () => void;
  hosts?: Record<string, string>;
  onHostCommit?: (id: string, host: string) => void;
  variant?: "sources" | "analysis";
  sshReady?: Record<string, boolean>;
  summaries?: Record<string, DroneSummary>;
};

export default function DroneList({
  droneIds,
  visible,
  onToggle,
  slug,
  onPulled,
  hosts = EMPTY_HOSTS,
  onHostCommit,
  variant = "sources",
  sshReady = EMPTY_READY,
  summaries = EMPTY_SUMMARIES,
}: Props) {
  const [draft, setDraft] = useState<Record<string, string>>(hosts);
  const [pulledOk, setPulledOk] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [sshPicker, setSshPicker] = useState<SshPicker | null>(null);
  const [importPanel, setImportPanel] = useState<ImportPanel | null>(null);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setDraft(hosts);
  }, [hosts]);

  if (droneIds.length === 0) return null;

  function clearError(droneId: string) {
    setRowError((prev) => {
      const next = { ...prev };
      delete next[droneId];
      return next;
    });
  }

  async function handleSsh(droneId: string) {
    if (!slug) return;
    setPicker(null);
    setImportPanel(null);
    setBusyId(droneId);
    clearError(droneId);
    try {
      const result = await listSshLogs(slug, Number(droneId));
      if (!result.ok || !result.logs?.length) {
        setRowError((prev) => ({
          ...prev,
          [droneId]: result.error || "no logs on pi",
        }));
        return;
      }
      setSshPicker({ droneId, logs: result.logs, selected: [] });
    } catch (e: unknown) {
      setRowError((prev) => ({
        ...prev,
        [droneId]: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSshCopy() {
    if (!slug || !sshPicker) return;
    const { droneId, logs, selected } = sshPicker;
    const files = logs
      .filter((log) => selected.includes(log.remote))
      .map((log) => ({ remote: log.remote, name: log.name, size: log.size }));
    if (files.length === 0) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setBusyId(droneId);
    setRebuilding(false);
    setProgress({
      name: files[0].name,
      index: 1,
      count: files.length,
      bytes: 0,
      total: files[0].size ?? 0,
      pct: 0,
    });
    clearError(droneId);
    try {
      const result = await copySshLogs(slug, Number(droneId), files, {
        signal: ac.signal,
        onProgress: setProgress,
      });
      if (result.cancelled) {
        setProgress(null);
        setRebuilding(false);
        return;
      }
      if (result.ok) {
        setProgress((prev) =>
          prev
            ? { ...prev, pct: 100, bytes: prev.total || prev.bytes }
            : {
                name: files[0].name,
                index: files.length,
                count: files.length,
                bytes: 0,
                total: 0,
                pct: 100,
              },
        );
        setRebuilding(true);
        await rebuild(slug);
        setPulledOk((prev) => ({ ...prev, [droneId]: true }));
        onPulled?.();
        setSshPicker(null);
        setProgress(null);
        setRebuilding(false);
      } else {
        setRowError((prev) => ({
          ...prev,
          [droneId]: result.error || "copy failed",
        }));
      }
    } catch (e: unknown) {
      setRowError((prev) => ({
        ...prev,
        [droneId]: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setBusyId(null);
    }
  }

  function cancelSshPicker() {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
    setRebuilding(false);
    setSshPicker(null);
  }

  async function handleMavlinkList(droneId: string, transport: MavlinkTransport) {
    if (!slug) return;
    setMenuId(null);
    setSshPicker(null);
    setImportPanel(null);
    let serial: string | undefined;
    if (transport === "serial") {
      const answer = window.prompt("Serial device", SERIAL_DEFAULT);
      if (answer === null) return;
      serial = answer.trim() || SERIAL_DEFAULT;
    }
    setBusyId(droneId);
    clearError(droneId);
    try {
      const result = await listMavlinkLogs(slug, Number(droneId), transport, serial);
      if (!result.ok || !result.logs?.length) {
        setRowError((prev) => ({
          ...prev,
          [droneId]: result.error || "no logs on vehicle",
        }));
        return;
      }
      setPicker({
        droneId,
        transport,
        serial,
        logs: result.logs,
        selected: result.logs[0].id,
      });
    } catch (e: unknown) {
      setRowError((prev) => ({
        ...prev,
        [droneId]: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleMavlinkDownload() {
    if (!slug || !picker) return;
    const { droneId, transport, serial, selected } = picker;
    const ac = new AbortController();
    abortRef.current = ac;
    setBusyId(droneId);
    setRebuilding(false);
    setProgress({
      name: `log_${selected}`,
      index: 1,
      count: 1,
      bytes: 0,
      total: picker.logs.find((log) => log.id === selected)?.size ?? 0,
      pct: 0,
    });
    clearError(droneId);
    const opts = { signal: ac.signal, onProgress: setProgress };
    try {
      let result = await downloadMavlinkLog(
        slug,
        Number(droneId),
        selected,
        transport,
        false,
        serial,
        opts,
      );
      if (result.cancelled) {
        setProgress(null);
        setRebuilding(false);
        return;
      }
      if (result.needs_replace) {
        const existing = result.existing ?? "existing .ulg";
        const ok = window.confirm(
          `Replace ${existing} for D${droneId} with the selected vehicle log?`,
        );
        if (!ok) {
          setProgress(null);
          return;
        }
        result = await downloadMavlinkLog(
          slug,
          Number(droneId),
          selected,
          transport,
          true,
          serial,
          opts,
        );
      }
      if (result.cancelled) {
        setProgress(null);
        setRebuilding(false);
        return;
      }
      if (result.ok) {
        setProgress((prev) =>
          prev
            ? { ...prev, pct: 100, bytes: prev.total || prev.bytes }
            : {
                name: `log_${selected}`,
                index: 1,
                count: 1,
                bytes: 0,
                total: 0,
                pct: 100,
              },
        );
        setRebuilding(true);
        await rebuild(slug);
        onPulled?.();
        setPicker(null);
        setProgress(null);
        setRebuilding(false);
      } else {
        setRowError((prev) => ({
          ...prev,
          [droneId]: result.error || "download failed",
        }));
      }
    } catch (e: unknown) {
      setRowError((prev) => ({
        ...prev,
        [droneId]: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setBusyId(null);
    }
  }

  function cancelMavlinkPicker() {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
    setRebuilding(false);
    setPicker(null);
  }

  function openImport(droneId: string) {
    setPicker(null);
    setSshPicker(null);
    setMenuId(null);
    setImportPanel({ droneId, path: "" });
  }

  async function handleBrowse() {
    if (!importPanel) return;
    try {
      const { path } = await browseFolder();
      if (path) {
        setImportPanel((prev) => (prev ? { ...prev, path } : prev));
      }
    } catch (e: unknown) {
      const droneId = importPanel.droneId;
      setRowError((prev) => ({
        ...prev,
        [droneId]: e instanceof Error ? e.message : String(e),
      }));
    }
  }

  async function handleImportFiles() {
    if (!slug || !importPanel) return;
    const path = importPanel.path.trim();
    if (!path) return;
    const { droneId } = importPanel;
    setBusyId(droneId);
    clearError(droneId);
    try {
      await importPaths(slug, [path], undefined, Number(droneId));
      await rebuild(slug);
      onPulled?.();
      setImportPanel(null);
    } catch (e: unknown) {
      setRowError((prev) => ({
        ...prev,
        [droneId]: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setBusyId(null);
    }
  }

  function commitHost(id: string) {
    const value = (draft[id] ?? hosts[id] ?? "").trim();
    const prev = (hosts[id] ?? "").trim();
    if (value === prev) return;
    onHostCommit?.(id, value);
  }

  return (
    <div className="flex flex-col gap-1 px-4 py-2 text-sm">
      <span className="text-zinc-400">Drones</span>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {droneIds.map((id) => {
          const ready = Boolean(sshReady[id] || pulledOk[id]);
          const note = rowError[id];
          const summary = summaries[id] ?? EMPTY_SUMMARY;
          return (
            <li key={id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {variant === "analysis" ? (
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={visible.has(id)}
                      onChange={(e) => onToggle(id, e.target.checked)}
                    />
                    <span>D{id}</span>
                  </label>
                ) : (
                  <span className="w-8 shrink-0">D{id}</span>
                )}
                {variant === "sources" && (
                  <>
                    <input
                      className="w-32 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-xs"
                      type="text"
                      aria-label={`D${id} host`}
                      placeholder="Pi IP"
                      value={draft[id] ?? hosts[id] ?? ""}
                      disabled={!slug}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [id]: e.target.value }))
                      }
                      onBlur={() => commitHost(id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitHost(id);
                      }}
                    />
                    <button
                      type="button"
                      className={BTN}
                      disabled={!slug || busyId === id}
                      onClick={() => openImport(id)}
                    >
                      Import
                    </button>
                    <button
                      type="button"
                      className={ready ? SSH_READY : SSH_IDLE}
                      disabled={!slug || busyId === id}
                      onClick={() => handleSsh(id)}
                    >
                      SSH
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        className={BTN}
                        disabled={!slug || busyId === id}
                        aria-haspopup="menu"
                        aria-expanded={menuId === id}
                        onClick={() =>
                          setMenuId((prev) => (prev === id ? null : id))
                        }
                      >
                        MAVLink
                      </button>
                      {menuId === id && (
                        <div
                          role="menu"
                          className="absolute z-10 mt-1 min-w-24 rounded border border-zinc-700 bg-zinc-900 py-1 shadow"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="block w-full px-3 py-1 text-left text-xs hover:bg-zinc-800"
                            onClick={() => handleMavlinkList(id, "tcp")}
                          >
                            TCP
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="block w-full px-3 py-1 text-left text-xs hover:bg-zinc-800"
                            onClick={() => handleMavlinkList(id, "serial")}
                          >
                            Serial
                          </button>
                        </div>
                      )}
                    </div>
                    {note ? (
                      <span className="flex-1 text-xs text-red-400" role="status">
                        {note}
                      </span>
                    ) : null}
                  </>
                )}
              </div>
              {variant === "sources" && (
                <section aria-label={`D${id} sources`} className="w-full pl-8 text-xs text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <span>Color</span>
                    <span
                      aria-label={`D${id} color`}
                      className="inline-block h-3 w-3 rounded-sm border border-zinc-600"
                      style={{ backgroundColor: droneColor(id) }}
                    />
                  </div>
                  <div>ULG {summary.ulg}</div>
                  <div>Date {summary.date}</div>
                  <div>Time {summary.time}</div>
                  <div>SM {summary.sm.length ? summary.sm.join(", ") : "—"}</div>
                  <div>HA {summary.ha.length ? summary.ha.join(", ") : "—"}</div>
                </section>
              )}
            </li>
          );
        })}
      </ul>
      {importPanel && (
        <div
          role="dialog"
          aria-label="Import files"
          className="mt-2 rounded border border-zinc-700 bg-zinc-900 p-3"
        >
          <p className="mb-2 text-xs text-zinc-400">D{importPanel.droneId}</p>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              className="min-w-48 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
              type="text"
              placeholder="path to .ulg or logs dir"
              value={importPanel.path}
              disabled={busyId === importPanel.droneId}
              onChange={(e) =>
                setImportPanel((prev) =>
                  prev ? { ...prev, path: e.target.value } : prev,
                )
              }
            />
            <button
              type="button"
              className={BTN}
              disabled={busyId === importPanel.droneId}
              onClick={() => handleBrowse()}
            >
              Browse
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={BTN}
              disabled={
                busyId === importPanel.droneId || !importPanel.path.trim()
              }
              onClick={() => handleImportFiles()}
            >
              Import
            </button>
            <button
              type="button"
              className={BTN}
              onClick={() => setImportPanel(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {sshPicker && (
        <div
          role="dialog"
          aria-label="SSH logs"
          className="mt-2 rounded border border-zinc-700 bg-zinc-900 p-3"
        >
          {progress ? (
            <TransferBar progress={progress} rebuilding={rebuilding} />
          ) : null}
          <p className="mb-2 text-xs text-zinc-400">
            D{sshPicker.droneId} Pi logs — select the files for this flight
          </p>
          <ul className="m-0 mb-2 max-h-64 list-none overflow-auto p-0">
            {sshPicker.logs.map((log) => (
              <li key={log.remote}>
                <label className="flex items-center gap-2 py-0.5 text-xs">
                  <input
                    type="checkbox"
                    checked={sshPicker.selected.includes(log.remote)}
                    disabled={busyId === sshPicker.droneId}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setSshPicker((prev) => {
                        if (!prev) return prev;
                        const next = on
                          ? [...prev.selected, log.remote]
                          : prev.selected.filter((r) => r !== log.remote);
                        return { ...prev, selected: next };
                      });
                    }}
                  />
                  {sshLogLabel(log)}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              className={BTN}
              disabled={
                busyId === sshPicker.droneId || sshPicker.selected.length === 0
              }
              onClick={() => handleSshCopy()}
            >
              Copy
            </button>
            <button
              type="button"
              className={BTN}
              onClick={() => cancelSshPicker()}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {picker && (
        <div
          role="dialog"
          aria-label="MAVLink logs"
          className="mt-2 rounded border border-zinc-700 bg-zinc-900 p-3"
        >
          {progress ? (
            <TransferBar progress={progress} rebuilding={rebuilding} />
          ) : null}
          <p className="mb-2 text-xs text-zinc-400">
            D{picker.droneId} via {picker.transport}
            {picker.serial ? ` (${picker.serial})` : ""} — select a log
          </p>
          <ul className="m-0 mb-2 max-h-40 list-none overflow-auto p-0">
            {picker.logs.map((log) => (
              <li key={log.id}>
                <label className="flex items-center gap-2 py-0.5 text-xs">
                  <input
                    type="radio"
                    name="mavlink-log"
                    checked={picker.selected === log.id}
                    onChange={() =>
                      setPicker((prev) =>
                        prev ? { ...prev, selected: log.id } : prev,
                      )
                    }
                  />
                  {mavlinkLogLabel(log)}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              className={BTN}
              disabled={busyId === picker.droneId}
              onClick={() => handleMavlinkDownload()}
            >
              Download
            </button>
            <button
              type="button"
              className={BTN}
              onClick={() => cancelMavlinkPicker()}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
