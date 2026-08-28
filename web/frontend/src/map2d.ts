import type { Data, Layout } from "plotly.js";
import {
  avatarLineDash,
  avatarShortLabel,
  enabledAvatarKeys,
  type AvatarKey,
  type PoseAvatars,
} from "./avatars";
import { droneColor, DRONE_COLORS } from "./droneColor";
import { enuToLla, type Origin } from "./markers";
import { sliceTrail } from "./trail";

export type MapPoint = {
  lat: number;
  lon: number;
  name?: string;
  color?: string;
  symbol?: string;
  halo?: boolean;
};

export type MapTrack = {
  lat: number[];
  lon: number[];
  name: string;
  color?: string;
  dash?: string;
};

export type MapFigure = {
  data: Data[];
  layout: Partial<Layout>;
};

export type MapTrajectory = {
  drones: Record<
    string,
    Record<string, { t: number[]; e: number[]; n: number[]; u: number[] }>
  >;
};

export function mapLayout(opts?: {
  datarevision?: string | number;
}): Partial<Layout> {
  return {
    autosize: true,
    uirevision: "map",
    datarevision: opts?.datarevision,
    map: { style: "open-street-map", uirevision: "map" },
    margin: { l: 0, r: 0, t: 48, b: 0 },
    showlegend: true,
    legend: {
      orientation: "h",
      y: 1,
      yanchor: "bottom",
      x: 0,
      xanchor: "left",
      font: { size: 10 },
    },
  };
}

export function mapTraces(points: MapPoint[], tracks: MapTrack[] = []): Data[] {
  const traces: Data[] = [];

  for (const track of tracks) {
    traces.push({
      type: "scattermap",
      mode: track.lat.length > 1 ? "lines" : "markers",
      name: track.name,
      lat: track.lat,
      lon: track.lon,
      line: {
        color: track.color,
        width: 2,
        dash: track.dash,
      },
      marker: { size: 4, color: track.color },
      showlegend: true,
    });
  }

  traces.push(...currentPointTraces(points));
  return traces;
}

const MAP_MARKER_SIZE = 10;

function currentPointTraces(points: MapPoint[]): Data[] {
  if (points.length === 0) return [];
  const traces: Data[] = [];

  const haloPts = points.filter(
    (p) => p.halo && (p.symbol ?? "circle") === "circle",
  );
  if (haloPts.length > 0) {
    traces.push({
      type: "scattermap",
      mode: "markers",
      name: "ekf-halo",
      lat: haloPts.map((p) => p.lat),
      lon: haloPts.map((p) => p.lon),
      marker: {
        size: MAP_MARKER_SIZE + 2,
        color: "black",
        symbol: "circle",
      },
      showlegend: false,
      hoverinfo: "skip",
    });
  }

  const groups = new Map<string, MapPoint[]>();
  for (const p of points) {
    const symbol = p.symbol ?? "circle";
    const key =
      symbol === "circle" ? "circle" : `${symbol}:${p.color ?? ""}`;
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }

  let mapped = false;
  for (const group of groups.values()) {
    const symbol = group[0].symbol ?? "circle";
    const isCircle = symbol === "circle";
    traces.push({
      type: "scattermap",
      mode: "markers",
      name: "Map",
      lat: group.map((p) => p.lat),
      lon: group.map((p) => p.lon),
      text: group.map((p) => p.name ?? ""),
      marker: {
        size: MAP_MARKER_SIZE,
        color: isCircle
          ? group.map(
              (p, i) => p.color ?? DRONE_COLORS[i % DRONE_COLORS.length],
            )
          : (group[0].color ?? DRONE_COLORS[0]),
        symbol,
      },
      showlegend: !mapped,
    });
    mapped = true;
  }
  return traces;
}

export function mapFigure(
  points: MapPoint[],
  tracks: MapTrack[] = [],
  opts?: { datarevision?: string | number },
): MapFigure {
  return {
    data: mapTraces(points, tracks),
    layout: mapLayout(opts),
  };
}

export function stableMapTracks(
  trajectory: MapTrajectory | null | undefined,
  origin: Origin | undefined,
  poseAvatars: Record<string, PoseAvatars | undefined>,
  uiAvatars: Record<string, unknown>,
  visibleDroneIds: string[],
  t: number,
): MapTrack[] {
  if (!trajectory || !origin) return [];
  const visible = new Set(visibleDroneIds);
  const tracks: MapTrack[] = [];

  for (const [id, sources] of Object.entries(trajectory.drones)) {
    if (!visible.has(id)) continue;
    const enabled = enabledAvatarKeys(id, poseAvatars[id], uiAvatars);
    for (const key of enabled) {
      const series = sources[key];
      if (!series || series.t.length < 2) continue;
      const sliced = sliceTrail(series, t);
      if (sliced.length === 0) continue;
      const lat: number[] = [];
      const lon: number[] = [];
      for (const p of sliced) {
        const lla = enuToLla(
          p.e,
          p.n,
          p.u,
          origin.lat,
          origin.lon,
          origin.alt_m,
        );
        lat.push(lla.lat);
        lon.push(lla.lon);
      }
      tracks.push({
        lat,
        lon,
        name: `D${id} ${avatarShortLabel(key as AvatarKey)}`,
        color: droneColor(id),
        dash: avatarLineDash(key as AvatarKey),
      });
    }
  }
  return tracks;
}
