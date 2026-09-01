import type { Data, Layout } from "plotly.js";
import {
  avatarShortLabel,
  enabledAvatarKeys,
  type AvatarKey,
  type PoseAvatars,
} from "./avatars";
import { replayColor, DRONE_COLORS } from "./droneColor";
import { enuToLla, MARKERS_TRACE_NAME, type Origin } from "./markers";
import { dashesForColors } from "./plotBoard";
import { mapTileStyle, plotTheme, type Skin } from "./skin";
import { sliceTrail } from "./trail";

type MapLayoutOpts = {
  datarevision?: string | number;
  skin?: Skin;
};

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

export function mapLayout(opts?: MapLayoutOpts): Partial<Layout> {
  const skin = opts?.skin ?? "night";
  const theme = plotTheme(skin);
  return {
    autosize: true,
    uirevision: "map",
    datarevision: opts?.datarevision,
    paper_bgcolor: theme.paper_bgcolor,
    font: { color: theme.font_color },
    map: { style: mapTileStyle(skin), uirevision: "map" },
    margin: { l: 0, r: 0, t: 88, b: 0 },
    showlegend: true,
    legend: {
      orientation: "h",
      y: 1,
      yanchor: "bottom",
      x: 0,
      xanchor: "left",
      font: { size: 10, color: theme.legend_font_color },
      bgcolor: theme.legend_bgcolor,
      entrywidth: 72,
      entrywidthmode: "pixels",
    },
  };
}

export function mapTraces(
  points: MapPoint[],
  tracks: MapTrack[] = [],
  textColor?: string,
): Data[] {
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
      legendgroup: track.name,
      showlegend: true,
    });
  }

  traces.push(...currentPointTraces(points, textColor));
  return traces;
}

const MAP_MARKER_SIZE = 10;

function currentPointTraces(points: MapPoint[], textColor?: string): Data[] {
  const traces: Data[] = [];
  const drones = points.filter((p) => (p.symbol ?? "circle") !== "diamond");
  const grounds = points.filter((p) => p.symbol === "diamond");

  for (const p of drones) {
    const symbol = p.symbol ?? "circle";
    const name = p.name ?? "drone";
    const color = p.color ?? DRONE_COLORS[0];
    if (p.halo && symbol === "circle") {
      traces.push({
        type: "scattermap",
        mode: "markers",
        name,
        legendgroup: name,
        lat: [p.lat],
        lon: [p.lon],
        marker: {
          size: MAP_MARKER_SIZE + 2,
          color: "black",
          symbol: "circle",
        },
        showlegend: false,
        hoverinfo: "skip",
      });
    }
    traces.push({
      type: "scattermap",
      mode: "markers",
      name,
      legendgroup: name,
      lat: [p.lat],
      lon: [p.lon],
      marker: {
        size: MAP_MARKER_SIZE,
        color,
        symbol,
      },
      showlegend: true,
    });
  }

  if (grounds.length > 0) {
    traces.push({
      type: "scattermap",
      mode: "markers+text",
      name: MARKERS_TRACE_NAME,
      lat: grounds.map((p) => p.lat),
      lon: grounds.map((p) => p.lon),
      text: grounds.map((p) => p.name ?? ""),
      textposition: "top right",
      textfont: textColor ? { size: 10, color: textColor } : { size: 10 },
      marker: {
        size: MAP_MARKER_SIZE,
        color: grounds[0].color ?? DRONE_COLORS[0],
        symbol: "diamond",
      },
      showlegend: true,
    });
  }
  return traces;
}

export function mapFigure(
  points: MapPoint[],
  tracks: MapTrack[] = [],
  opts?: MapLayoutOpts,
): MapFigure {
  const theme = plotTheme(opts?.skin ?? "night");
  return {
    data: mapTraces(points, tracks, theme.font_color),
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
        color: replayColor(id),
      });
    }
  }
  const dashes = dashesForColors(tracks.map((t) => t.color ?? ""));
  return tracks.map((t, i) => ({ ...t, dash: dashes[i] }));
}
