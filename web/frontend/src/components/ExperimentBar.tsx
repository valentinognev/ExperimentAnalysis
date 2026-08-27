import { useCallback, useEffect, useState } from "react";
import {
  createExperiment,
  importPaths,
  listExperiments,
  openExperiment,
  rebuild,
  type ExperimentSummary,
} from "../api";

type Props = {
  slug: string | null;
  onSlugChange: (slug: string | null) => void;
  onImported?: () => void;
};

export default function ExperimentBar({ slug, onSlugChange, onImported }: Props) {
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [newName, setNewName] = useState("");
  const [importPath, setImportPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleImport() {
    if (!slug || !importPath.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await importPaths(slug, [importPath.trim()]);
      setImportPath("");
      await rebuild(slug);
      await refresh();
      await openExperiment(slug);
      onImported?.();
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

      <label className="flex items-center gap-2 text-sm">
        <span className="text-zinc-400">New</span>
        <input
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
          type="text"
          placeholder="name"
          value={newName}
          disabled={busy}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <button
          className="rounded bg-zinc-700 px-2 py-1 hover:bg-zinc-600 disabled:opacity-50"
          type="button"
          disabled={busy || !newName.trim()}
          onClick={handleCreate}
        >
          Create
        </button>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-zinc-400">Import</span>
        <input
          className="min-w-48 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
          type="text"
          placeholder="path to .ulg"
          value={importPath}
          disabled={busy || !slug}
          onChange={(e) => setImportPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleImport()}
        />
        <button
          className="rounded bg-zinc-700 px-2 py-1 hover:bg-zinc-600 disabled:opacity-50"
          type="button"
          disabled={busy || !slug || !importPath.trim()}
          onClick={handleImport}
        >
          Import
        </button>
      </label>

      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  );
}
