import { useState } from "react";
import { inspectReplay } from "../api";
import { isReplayId } from "../replayId";
import { OverlayPlots } from "../replay/OverlayPlots";
import { ParamTable } from "../replay/ParamTable";
import { RunPanel } from "../replay/RunPanel";
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
}: {
  slug: string;
  manifest: Record<string, unknown>;
}) {
  const { skin } = useSkin();
  const ids = physicalUlgIds(manifest);
  const [droneId, setDroneId] = useState<number | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [params, setParams] = useState<Param[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number | string>>(
    {},
  );
  const [status, setStatus] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<InspectInfo | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSelect(raw: string) {
    if (raw === "") {
      setDroneId(null);
      setRunId(null);
      setParams([]);
      setOverrides({});
      setStatus(undefined);
      setInfo(null);
      return;
    }
    const id = Number(raw);
    if (!Number.isInteger(id)) return;
    setDroneId(id);
    setBusy(true);
    try {
      const result = (await inspectReplay(slug, id)) as InspectInfo;
      setError(null);
      setInfo(result);
      setRunId(result.run_id);
      setParams(Array.isArray(result.params) ? (result.params as Param[]) : []);
      setOverrides({});
      setStatus(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
        onJob={(job) => setStatus(job?.status)}
      />
      <OverlayPlots slug={slug} runId={runId} status={status} skin={skin} />
    </div>
  );
}
