import type { TransferProgress } from "./transferProgress";

export type ExperimentSummary = {
  slug: string;
  name: string;
  drone_ids: string[];
  missing: string[];
};

export type ExperimentDetail = {
  slug: string;
  manifest: Record<string, unknown>;
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res =
    init === undefined ? await fetch(url) : await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function listExperiments(): Promise<ExperimentSummary[]> {
  return json("/api/experiments");
}

export function createExperiment(name: string): Promise<ExperimentDetail> {
  return json("/api/experiments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function openExperiment(slug: string): Promise<ExperimentDetail> {
  return json(`/api/experiments/${slug}`);
}

export function patchManifest(
  slug: string,
  patch: Record<string, unknown>,
): Promise<ExperimentDetail> {
  return json(`/api/experiments/${slug}/manifest`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export type MarkerRecord = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  alt_m: number;
};

export function patchMarkers(
  slug: string,
  markers: MarkerRecord[],
): Promise<ExperimentDetail> {
  return json(`/api/experiments/${slug}/markers`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markers }),
  });
}

export function browseFolder(): Promise<{ path: string | null }> {
  return json("/api/browse-folder", {
    method: "POST",
  });
}

export function importPaths(
  slug: string,
  paths: string[],
  assignments?: Record<string, number>,
  droneId?: number,
): Promise<Record<string, unknown>> {
  const body: {
    paths: string[];
    assignments?: Record<string, number>;
    drone_id?: number;
  } = {
    paths,
  };
  if (assignments !== undefined) {
    body.assignments = assignments;
  }
  if (droneId !== undefined) {
    body.drone_id = droneId;
  }
  return json(`/api/experiments/${slug}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function addDrone(slug: string, id: number): Promise<ExperimentDetail> {
  return json(`/api/experiments/${slug}/drones`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

export function pullDrone(
  slug: string,
  droneId: number,
  adapters: ("ssh" | "mavlink")[],
): Promise<{ ok: boolean; drones: Record<string, { ok: boolean; error?: string }> }> {
  return json(`/api/experiments/${slug}/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drone_id: droneId, adapters }),
  });
}

export type SshLogList = {
  ok: boolean;
  logs?: {
    kind: "sm" | "ha";
    name: string;
    remote: string;
    size: number;
    mtime: string;
  }[];
  error?: string;
};

export function listSshLogs(slug: string, droneId: number): Promise<SshLogList> {
  return json(`/api/experiments/${slug}/ssh/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drone_id: droneId }),
  });
}

export type SshCopyFile = { remote: string; name: string; size?: number };

export type CopySshOpts = {
  signal?: AbortSignal;
  onProgress?: (p: TransferProgress) => void;
};

function isAbort(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

function parseTransferLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) return null;
  const payload = trimmed.startsWith("data:")
    ? trimmed.slice("data:".length).trim()
    : trimmed;
  if (!payload) return null;
  return JSON.parse(payload) as Record<string, unknown>;
}

function isTransferStream(contentType: string): boolean {
  return contentType.includes("event-stream") || contentType.includes("ndjson");
}

async function readTransferStream(
  body: ReadableStream<Uint8Array>,
  onProgress?: (p: TransferProgress) => void,
): Promise<{
  ok: boolean;
  error?: string;
  cancelled?: boolean;
  needs_replace?: boolean;
  existing?: string;
}> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let last: Record<string, unknown> = {};
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const ev = parseTransferLine(line);
      if (!ev) continue;
      if (ev.event === "progress") onProgress?.(ev as unknown as TransferProgress);
      last = ev;
    }
  }
  if (buf.trim()) {
    const ev = parseTransferLine(buf);
    if (ev) {
      last = ev;
      if (last.event === "progress") onProgress?.(last as unknown as TransferProgress);
    }
  }
  if (last.event === "cancelled" || last.cancelled) {
    return { ok: false, cancelled: true };
  }
  if (last.needs_replace || last.event === "needs_replace") {
    return {
      ok: false,
      needs_replace: true,
      existing: last.existing as string | undefined,
    };
  }
  if (last.event === "done" || last.ok === true) {
    return { ok: true };
  }
  if (last.ok === false) {
    return { ok: false, error: String(last.error || "copy failed") };
  }
  return { ok: false, error: "empty response" };
}

export function copySshLogs(
  slug: string,
  droneId: number,
  files: SshCopyFile[],
  opts?: CopySshOpts,
): Promise<{ ok: boolean; error?: string; cancelled?: boolean }> {
  return (async () => {
    try {
      const res = await fetch(`/api/experiments/${slug}/ssh/copy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ drone_id: droneId, files }),
        signal: opts?.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `${res.status} ${res.statusText}`);
      }
      const ctype = (res.headers?.get("content-type") || "").toLowerCase();
      if (res.body && isTransferStream(ctype)) {
        return readTransferStream(res.body, opts?.onProgress);
      }
      return (await res.json()) as { ok: boolean; error?: string };
    } catch (e: unknown) {
      if (isAbort(e)) return { ok: false, cancelled: true };
      throw e;
    }
  })();
}

export type MavlinkTransport = "tcp" | "serial";

export type MavlinkLogList = {
  ok: boolean;
  logs?: { id: number; time_utc: number; size: number }[];
  error?: string;
};

export function listMavlinkLogs(
  slug: string,
  droneId: number,
  transport: MavlinkTransport,
  serial?: string,
): Promise<MavlinkLogList> {
  return json(`/api/experiments/${slug}/mavlink/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      drone_id: droneId,
      transport,
      ...(serial !== undefined ? { serial } : {}),
    }),
  });
}

export type MavlinkDownloadResult = {
  ok: boolean;
  needs_replace?: boolean;
  existing?: string;
  error?: string;
  cancelled?: boolean;
};

export function downloadMavlinkLog(
  slug: string,
  droneId: number,
  logId: number,
  transport: MavlinkTransport,
  confirmReplace = false,
  serial?: string,
  opts?: CopySshOpts,
): Promise<MavlinkDownloadResult> {
  return (async () => {
    try {
      const res = await fetch(`/api/experiments/${slug}/mavlink/download`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          drone_id: droneId,
          log_id: logId,
          transport,
          confirm_replace: confirmReplace,
          ...(serial !== undefined ? { serial } : {}),
        }),
        signal: opts?.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `${res.status} ${res.statusText}`);
      }
      const ctype = (res.headers?.get("content-type") || "").toLowerCase();
      if (res.body && isTransferStream(ctype)) {
        return readTransferStream(res.body, opts?.onProgress);
      }
      return (await res.json()) as MavlinkDownloadResult;
    } catch (e: unknown) {
      if (isAbort(e)) return { ok: false, cancelled: true };
      throw e;
    }
  })();
}

export function rebuild(slug: string): Promise<Record<string, unknown>> {
  return json(`/api/experiments/${slug}/rebuild`, {
    method: "POST",
  });
}

export type PoseAvatar = { e: number; n: number; u: number };

export type PoseVector = { e: number; n: number; u: number };

export type PoseDrone = {
  present: boolean;
  synced: boolean;
  attitude_q_xyzw?: [number, number, number, number];
  avatars?: {
    ekf_ned?: PoseAvatar;
    gps?: PoseAvatar;
    sm_ned?: PoseAvatar;
    sm_lla?: PoseAvatar;
  };
  vectors?: {
    velocity?: PoseVector;
  };
};

export type PoseResponse = {
  t: number;
  origin: { lat: number; lon: number; alt_m: number };
  drones: Record<string, PoseDrone>;
};

export function getDuration(slug: string): Promise<{ t_max_s: number }> {
  return json(`/api/experiments/${slug}/duration`);
}

export function getPose(slug: string, t: number): Promise<PoseResponse> {
  return json(`/api/experiments/${slug}/pose?t=${t}`);
}

export type SeriesChannel = { t: number[]; y: number[] };

export type SeriesResponse = Record<string, SeriesChannel>;

export function getSeries(
  slug: string,
  channels: string[],
  t0?: number,
  t1?: number,
): Promise<SeriesResponse> {
  const params = new URLSearchParams();
  for (const ch of channels) {
    params.append("channels", ch);
  }
  if (t0 !== undefined) params.set("t0", String(t0));
  if (t1 !== undefined) params.set("t1", String(t1));
  return json(`/api/experiments/${slug}/series?${params}`);
}

export type TopicsTree = Record<
  string,
  Record<string, Record<string, string[]>>
>;

export function getTopics(slug: string): Promise<TopicsTree> {
  return json(`/api/experiments/${slug}/topics`);
}
