import { useEffect, useRef, useState } from "react";
import { inspectReplay } from "../api";
import { isReplayId } from "../replayId";
import { OverlayPlots } from "../replay/OverlayPlots";
import { ParamTable } from "../replay/ParamTable";
import { RunPanel } from "../replay/RunPanel";
import { loadSession, saveSessionPartial } from "../replay/sessionPrefs";
import { useSkin } from "../SkinContext";
import { INPUT, LABEL } from "../replay/ui";

type Param = { name: string; value: number | string };

type InspectInfo = {
  run_id: string;
  params: unknown;
  topics: unknown;
  duration_s: number;
  warnings: string[];
};

type ManifestDrone = {
  id?: unknown;
  sources?: { ulg?: unknown };
};

export function physicalUlgIds(manifest: Record<string, unknown>): number[] {
  const drones = manifest.drones;
  if (!Array.isArray(drones)) return [];
  const out: number[] = [];
  for (const raw of drones) {
    if (!raw || typeof raw !== "object") continue;
    const d = raw as ManifestDrone;
    if (isReplayId(d.id)) continue;
    const n =
      typeof d.id === "number"
        ? d.id
        : typeof d.id === "string" && /^\d+$/.test(d.id)
          ? Number(d.id)
          : null;
    if (n === null || !Number.isInteger(n)) continue;
    const ulg = d.sources?.ulg;
    if (!Array.isArray(ulg) || ulg.length === 0) continue;
    out.push(n);
  }
  return out;
}

export default function ReplayTab({
  slug,
  manifest,
  onPulled,
}: {
  slug: string;
  manifest: Record<string, unknown>;
  onPulled?: () => void;
}) {
  const { skin } = useSkin();
  const ids = physicalUlgIds(manifest);
  const [droneId, setDroneId] = useState<number | null>(() => {
    const prefs = loadSession();
    if (
      prefs.slug === slug &&
      prefs.droneId != null &&
      ids.includes(prefs.droneId)
    ) {
      return prefs.droneId;
    }
    return null;
  });
  const [runId, setRunId] = useState<string | null>(null);
  const [params, setParams] = useState<Param[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number | string>>(
    {},
  );
  const [status, setStatus] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<InspectInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const inspectGen = useRef(0);

  function clearInspect() {
    setRunId(null);
    setParams([]);
    setOverrides({});
    setStatus(undefined);
    setInfo(null);
    setError(null);
  }

  function resetSelection() {
    inspectGen.current += 1;
    setDroneId(null);
    clearInspect();
    setBusy(false);
  }

  async function inspectDrone(id: number) {
    inspectGen.current += 1;
    const gen = inspectGen.current;
    setDroneId(id);
    clearInspect();
    setBusy(true);
    try {
      const result = (await inspectReplay(slug, id)) as InspectInfo;
      if (gen !== inspectGen.current) return;
      setError(null);
      setInfo(result);
      setRunId(result.run_id);
      setParams(Array.isArray(result.params) ? (result.params as Param[]) : []);
      setOverrides({});
      setStatus(undefined);
    } catch (e) {
      if (gen !== inspectGen.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === inspectGen.current) setBusy(false);
    }
  }

  function onSelect(raw: string) {
    if (raw === "") {
      saveSessionPartial({ slug, droneId: null });
      resetSelection();
      return;
    }
    const id = Number(raw);
    if (!Number.isInteger(id)) return;
    saveSessionPartial({ slug, droneId: id });
    void inspectDrone(id);
  }

  useEffect(() => {
    const prefs = loadSession();
    const id =
      prefs.slug === slug &&
      prefs.droneId != null &&
      ids.includes(prefs.droneId)
        ? prefs.droneId
        : null;
    if (id == null) {
      resetSelection();
      return;
    }
    void inspectDrone(id);
    // Restore once per experiment slug; ids come from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <label className={LABEL} htmlFor="replay-drone">
          Replay drone
        </label>
        <select
          id="replay-drone"
          aria-label="Replay drone"
          className={INPUT}
          value={droneId ?? ""}
          onChange={(e) => void onSelect(e.target.value)}
        >
          <option value="">Select drone</option>
          {ids.map((id) => (
            <option key={id} value={id}>
              {`D${id}`}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {info && (
        <div className="text-sm text-zinc-400">
          <p>{info.duration_s}</p>
          {info.warnings.length > 0 && <p>{info.warnings.join(" ")}</p>}
          <p>{info.run_id}</p>
        </div>
      )}
      <ParamTable params={params} onOverrides={setOverrides} />
      <RunPanel
        slug={slug}
        runId={runId}
        droneId={droneId}
        overrides={overrides}
        busy={busy}
        onJob={(job) => {
          setStatus(job?.status);
          if (job?.status === "success") onPulled?.();
        }}
      />
      <OverlayPlots slug={slug} runId={runId} status={status} skin={skin} />
    </div>
  );
}
