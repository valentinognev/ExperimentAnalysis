import { useCallback, useEffect, useRef, useState } from "react";
import {
  createExperiment,
  listExperiments,
  patchManifest,
  setDroneCount,
  type ExperimentSummary,
} from "../api";
import { droneCountFromIds } from "../visibleDrones";

type Props = {
  slug: string | null;
  onSlugChange: (slug: string | null) => void;
  onDronesChange?: () => void;
  /** Grow the drone list to D1..DN as soon as the count is chosen. */
  onDroneCountChange?: (n: number) => void;
  /** Physical ids already in the open experiment (from the manifest). */
  droneIds?: string[];
  /** Manifest name of the open experiment; fills the Name field. */
  experimentName?: string;
  /** New / Drones 1–9 / Update. Chrome keeps the experiment switcher. */
  showSetup?: boolean;
};

const DRONE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const EMPTY_IDS: string[] = [];

function parseDroneId(text: string): number | null {
  const id = Number(text);
  if (!Number.isInteger(id) || id < 1 || id > 9) return null;
  return id;
}

function countLabel(droneIds: string[]): string {
  const n = droneCountFromIds(droneIds);
  return n > 0 ? String(n) : "";
}

export default function ExperimentBar({
  slug,
  onSlugChange,
  onDronesChange,
  onDroneCountChange,
  droneIds = EMPTY_IDS,
  experimentName = "",
  showSetup = true,
}: Props) {
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [newName, setNewName] = useState("");
  const [droneIdText, setDroneIdText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingCountRef = useRef("");
  const prevSlugRef = useRef(slug);

  const droneId = parseDroneId(droneIdText);

  async function persistDrones(targetSlug: string, count: number) {
    await setDroneCount(targetSlug, count);
    onDroneCountChange?.(count);
  }

  const refresh = useCallback(async () => {
    const list = await listExperiments();
    setExperiments(list);
    return list;
  }, []);

  useEffect(() => {
    refresh().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [refresh]);

  useEffect(() => {
    const openedFromNone = prevSlugRef.current == null;
    prevSlugRef.current = slug;

    if (!slug) {
      setDroneIdText("");
      return;
    }
    const fromIds = countLabel(droneIds);
    if (fromIds) {
      setDroneIdText(fromIds);
      pendingCountRef.current = fromIds;
      return;
    }
    if (openedFromNone) {
      const pending = pendingCountRef.current;
      const n = parseDroneId(pending);
      if (n !== null) {
        setDroneIdText(pending);
        onDroneCountChange?.(n);
        return;
      }
    }
    setDroneIdText("");
  }, [slug, droneIds, onDroneCountChange]);

  useEffect(() => {
    setNewName(slug ? experimentName : "");
  }, [slug, experimentName]);

  async function handleCreate() {
    if (!newName.trim()) return;
    const count = droneId;
    setBusy(true);
    setError(null);
    try {
      const result = await createExperiment(newName.trim());
      if (count !== null) {
        await persistDrones(result.slug, count);
      }
      await refresh();
      onSlugChange(result.slug);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate() {
    if (!slug) return;
    const name = newName.trim();
    const count = droneId;
    if (count === null && !name) return;
    setBusy(true);
    setError(null);
    try {
      if (name) {
        await patchManifest(slug, { name });
      }
      if (count !== null) {
        await persistDrones(slug, count);
      }
      await refresh();
      onDronesChange?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-zinc-400">Experiment</span>
        <select
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
          aria-label="Experiment"
          value={slug ?? ""}
          disabled={busy}
          onChange={(e) => onSlugChange(e.target.value || null)}
        >
          <option value="">— select —</option>
          {experiments.map((exp) => (
            <option key={exp.slug} value={exp.slug}>
              {exp.slug}
            </option>
          ))}
        </select>
      </label>

      {showSetup && (
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-zinc-400">Name</span>
            <input
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              type="text"
              placeholder="name"
              value={newName}
              disabled={busy}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </label>
          <button
            className="rounded bg-zinc-700 px-2 py-1 hover:bg-zinc-600 disabled:opacity-50"
            type="button"
            disabled={busy || !newName.trim()}
            onClick={handleCreate}
          >
            New
          </button>
        </div>
      )}

      {showSetup && (
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-zinc-400">Drone #</span>
            <select
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              aria-label="Drone #"
              value={droneIdText}
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value;
                setDroneIdText(v);
                pendingCountRef.current = v;
                const n = parseDroneId(v);
                if (slug && n !== null) onDroneCountChange?.(n);
              }}
            >
              <option value="">—</option>
              {DRONE_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded bg-zinc-700 px-2 py-1 hover:bg-zinc-600 disabled:opacity-50"
            type="button"
            disabled={busy || !slug || (droneId === null && !newName.trim())}
            onClick={handleUpdate}
          >
            Update
          </button>
        </div>
      )}

      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  );
}
