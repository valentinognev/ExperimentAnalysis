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
