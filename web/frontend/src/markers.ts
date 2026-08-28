/** WGS84 spherical geo helpers (matches backend ea/geo.py). */

const WGS84_A_M = 6378137;
const METERS_PER_DEG_LAT = (WGS84_A_M * Math.PI) / 180;

export type Marker = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  alt_m: number;
};

export type Origin = {
  lat: number;
  lon: number;
  alt_m: number;
};

export function llaToEnu(
  lat: number,
  lon: number,
  alt: number,
  originLat: number,
  originLon: number,
  originAlt: number,
): { e: number; n: number; u: number } {
  const n = (lat - originLat) * METERS_PER_DEG_LAT;
  const e =
    (lon - originLon) *
    METERS_PER_DEG_LAT *
    Math.cos((originLat * Math.PI) / 180);
  const u = alt - originAlt;
  return { e, n, u };
}

export function enuToLla(
  e: number,
  n: number,
  u: number,
  originLat: number,
  originLon: number,
  originAlt: number,
): { lat: number; lon: number; alt_m: number } {
  const lat = originLat + n / METERS_PER_DEG_LAT;
  const lon =
    originLon +
    e / (METERS_PER_DEG_LAT * Math.cos((originLat * Math.PI) / 180));
  const alt_m = originAlt + u;
  return { lat, lon, alt_m };
}

function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  return WGS84_A_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceM(
  a: Marker,
  b: Marker,
): { horizontal_m: number; enu_3d_m: number } {
  const horizontal_m = haversineM(a.lat, a.lon, b.lat, b.lon);
  const { e, n, u } = llaToEnu(b.lat, b.lon, b.alt_m, a.lat, a.lon, a.alt_m);
  const enu_3d_m = Math.sqrt(e * e + n * n + u * u);
  return { horizontal_m, enu_3d_m };
}

export const MARKERS_TRACE_NAME = "Markers";
export const PLOT_DOUBLE_CLICK_MS = 400;

/** Fill for ground markers; chosen to sit far from every Observation Board drone hue. */
export const MARKER_COLOR = "#FFFFFF";
export const MARKER_OUTLINE_COLOR = "#000000";

/** Plotly scene click with x/y as E/N; projects to ground plane u=0. */
export type PlotlyGroundClick = {
  points?: Array<{
    x?: number | null;
    y?: number | null;
    data?: { name?: string };
    customdata?: unknown;
  }>;
};

export function isPlotDoubleClick(
  event: { detail?: number } | undefined,
  nowMs: number,
  lastClickMs: number | null,
  windowMs = PLOT_DOUBLE_CLICK_MS,
): boolean {
  if (event?.detail === 2) return true;
  return lastClickMs != null && nowMs - lastClickMs < windowMs;
}

export function markerIdFromPlotPick(
  pick: PlotlyGroundClick,
): string | null {
  const pt = pick.points?.[0];
  if (!pt || pt.data?.name !== MARKERS_TRACE_NAME) return null;
  const data = pt.customdata;
  if (typeof data === "string") return data;
  if (Array.isArray(data) && typeof data[0] === "string") return data[0];
  return null;
}

export function groundClickToLla(
  plotlyClick: PlotlyGroundClick,
  origin: Origin,
): { lat: number; lon: number; alt_m: number } | null {
  const pt = plotlyClick.points?.[0];
  if (pt?.x == null || pt?.y == null) return null;
  return enuToLla(pt.x, pt.y, 0, origin.lat, origin.lon, origin.alt_m);
}

export function newMarkerId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
