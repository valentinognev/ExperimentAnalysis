import { useEffect, useRef, useState } from "react";
import { getReplay, startReplay, stopReplay } from "../api";
import { BTN } from "./ui";

type Job = {
  status?: string;
  results_dir?: string | null;
  replay_id?: string | null;
  error?: string | null;
  log?: string;
};

function isTerminal(status?: string) {
  return status === "success" || status === "failed";
}

export function RunPanel({
  slug,
  runId,
  droneId,
  overrides,
  busy,
  onJob,
}: {
  slug: string;
  runId: string | null;
  droneId: number | null;
  overrides: Record<string, number | string>;
  busy: boolean;
  onJob?: (job: Job | null) => void;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    setJob(null);
    onJob?.(null);
    stopPolling();
  }, [runId]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }

  async function refreshJob(id: string): Promise<Job | undefined> {
    try {
      const next = (await getReplay(slug, id)) as Job;
      setJob(next);
      onJob?.(next);
      if (isTerminal(next.status)) stopPolling();
      return next;
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }

  async function onReplay() {
    if (!runId || droneId == null) return;
    setErrorText(null);
    try {
      await startReplay(slug, {
        run_id: runId,
        drone_id: droneId,
        overrides,
      });
      stopPolling();
      const next = await refreshJob(runId);
      if (next && !isTerminal(next.status)) {
        pollRef.current = setInterval(() => {
          void refreshJob(runId);
        }, 500);
        setPolling(true);
      }
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : String(e));
    }
  }

  async function onStop() {
    if (!runId) return;
    try {
      await stopReplay(slug, runId);
      await refreshJob(runId);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : String(e));
    }
  }

  const replayLocked =
    polling && job != null && !isTerminal(job.status);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={BTN}
          disabled={!runId || droneId == null || busy || replayLocked}
          onClick={onReplay}
        >
          Replay
        </button>
        <button type="button" className={BTN} onClick={onStop}>
          Stop
        </button>
      </div>
      {errorText && <p className="text-sm text-red-400">{errorText}</p>}
      {job && (
        <div className="text-sm text-zinc-400">
          <p>{job.status}</p>
          {job.results_dir != null && job.results_dir !== "" && (
            <p>{job.results_dir}</p>
          )}
          {job.replay_id != null && job.replay_id !== "" && <p>{job.replay_id}</p>}
          {job.error != null && job.error !== "" && (
            <p className="text-red-400">{job.error}</p>
          )}
          <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-300">
            {job.log ?? ""}
          </pre>
        </div>
      )}
    </div>
  );
}
