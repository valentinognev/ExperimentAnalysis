import { DEFAULT_PARAM_FILTER } from "./paramFilter";

export const SESSION_STORAGE_KEY = "ea-replay-session";

export type SessionPrefs = {
  ulgPath: string;
  filter: string;
  experimentName: string;
  overrides: Record<string, number | string>;
};

export const DEFAULT_SESSION: SessionPrefs = {
  ulgPath: "",
  filter: DEFAULT_PARAM_FILTER,
  experimentName: "",
  overrides: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOverrides(raw: unknown): Record<string, number | string> {
  if (!isRecord(raw)) return {};
  const out: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" || typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

export function parseSession(raw: unknown): SessionPrefs {
  if (!isRecord(raw)) {
    return { ...DEFAULT_SESSION, overrides: {} };
  }
  return {
    ulgPath: typeof raw.ulgPath === "string" ? raw.ulgPath : DEFAULT_SESSION.ulgPath,
    filter: typeof raw.filter === "string" ? raw.filter : DEFAULT_SESSION.filter,
    experimentName:
      typeof raw.experimentName === "string"
        ? raw.experimentName
        : DEFAULT_SESSION.experimentName,
    overrides: parseOverrides(raw.overrides),
  };
}

export function loadSession(): SessionPrefs {
  try {
    const text = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!text) return { ...DEFAULT_SESSION, overrides: {} };
    return parseSession(JSON.parse(text) as unknown);
  } catch {
    return { ...DEFAULT_SESSION, overrides: {} };
  }
}

export function saveSession(prefs: SessionPrefs): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota / disabled storage must not break the UI.
  }
}

export function saveSessionPartial(patch: Partial<SessionPrefs>): void {
  saveSession({ ...loadSession(), ...patch });
}

export function mergeOverrides(
  original: Record<string, number | string>,
  overrides: Record<string, number | string>,
): Record<string, number | string> {
  const next = { ...original };
  for (const [key, value] of Object.entries(overrides)) {
    if (Object.hasOwn(original, key)) next[key] = value;
  }
  return next;
}
