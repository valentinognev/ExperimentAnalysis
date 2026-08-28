import { useCallback, useEffect, useState } from "react";
import {
  addDrone,
  createExperiment,
  listExperiments,
  rebuild,
  type ExperimentSummary,
} from "../api";

type Props = {
  slug: string | null;
  onSlugChange: (slug: string | null) => void;
  onImported?: () => void;
  onRebuilt?: () => void;
  onDronesChange?: () => void;
  /** New / Drone # / Add / Rebuild. Chrome keeps the experiment switcher. */
  showSetup?: boolean;
};

function parsePositiveInt(text: string): number | null {
  const id = Number.parseInt(text, 10);
  if (Number.isNaN(id) || id < 1) return null;
  return id;
}

export default function ExperimentBar({
  slug,
  onSlugChange,
  onRebuilt,
  onDronesChange,
  showSetup = true,
}: Props) {
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [newName, setNewName] = useState("");
  const [droneIdText, setDroneIdText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const droneId = parsePositiveInt(droneIdText);

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

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createExperiment(newName.trim());
      setNewName("");
      await refresh();
      onSlugChange(result.slug);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    if (!slug || droneId === null) return;
    setBusy(true);
    setError(null);
    try {
      await addDrone(slug, droneId);
      setDroneIdText("");
      await refresh();
      onDronesChange?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRebuild() {
    if (!slug) return;
    setBusy(true);
    setError(null);
    try {
      await rebuild(slug);
      await refresh();
      onRebuilt?.();
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
            <input
              className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              type="number"
              min={1}
              step={1}
              aria-label="Drone #"
              value={droneIdText}
              disabled={busy}
              onChange={(e) => setDroneIdText(e.target.value)}
            />
          </label>
          <button
            className="rounded bg-zinc-700 px-2 py-1 hover:bg-zinc-600 disabled:opacity-50"
            type="button"
            disabled={busy || !slug || droneId === null}
            onClick={handleAdd}
          >
            Add
          </button>
        </div>
      )}

      {showSetup && (
        <button
          className="rounded bg-zinc-700 px-2 py-1 text-sm hover:bg-zinc-600 disabled:opacity-50"
          type="button"
          disabled={busy || !slug}
          onClick={handleRebuild}
        >
          Rebuild
        </button>
      )}

      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  );
}
