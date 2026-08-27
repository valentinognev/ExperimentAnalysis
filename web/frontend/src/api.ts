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

export function importPaths(
  slug: string,
  paths: string[],
): Promise<Record<string, unknown>> {
  return json(`/api/experiments/${slug}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
}

export function rebuild(slug: string): Promise<Record<string, unknown>> {
  return json(`/api/experiments/${slug}/rebuild`, {
    method: "POST",
  });
}

export type PoseAvatar = { e: number; n: number; u: number };

export type PoseDrone = {
  present: boolean;
  synced: boolean;
  attitude_q_xyzw?: [number, number, number, number];
  avatars?: {
    ekf_ned: PoseAvatar;
  };
};

export type PoseResponse = {
  t: number;
  origin: { lat: number; lon: number; alt_m: number };
  drones: Record<string, PoseDrone>;
};

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
