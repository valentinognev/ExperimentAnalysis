import { memo, useMemo } from "react";
import Plot from "react-plotly.js";
import type { PoseResponse, TrajectoryResponse } from "../api";
import {
  avatarShortLabel,
  enabledAvatarKeys,
  hasAnyMapAvatar,
  type PoseAvatars,
} from "../avatars";
import { enuToLla, MARKER_COLOR, type Marker } from "../markers";
import { mapFigure, stableMapTracks, type MapPoint } from "../map2d";
import { droneColor } from "../droneColor";
import { avatarMarkerStyle } from "../avatarMarker";
import type { Skin } from "../skin";

type Map2DProps = {
  pose: PoseResponse | null;
  trajectory?: TrajectoryResponse | null;
  uiAvatars?: Record<string, unknown>;
  markers: Marker[];
  visibleDroneIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skin?: Skin;
};

export function hasGpsAvatar(pose: PoseResponse | null): boolean {
  if (!pose) return false;
  return hasAnyMapAvatar(pose.drones);
}

function currentPoints(
  pose: PoseResponse | null,
  uiAvatars: Record<string, unknown>,
  markers: Marker[],
  visibleDroneIds: string[],
): MapPoint[] {
  const points: MapPoint[] = [];
  const origin = pose?.origin;
  const visible = new Set(visibleDroneIds);

  if (pose && origin) {
    for (const [id, d] of Object.entries(pose.drones)) {
      if (!visible.has(id) || !d.avatars) continue;
      const enabled = enabledAvatarKeys(id, d.avatars, uiAvatars);
      for (const key of enabled) {
        const pos = d.avatars[key];
        if (!pos) continue;
        const lla = enuToLla(
          pos.e,
          pos.n,
          pos.u,
          origin.lat,
          origin.lon,
          origin.alt_m,
        );
        points.push({
          lat: lla.lat,
          lon: lla.lon,
          name: `D${id} ${avatarShortLabel(key)}`,
          color: droneColor(id),
          symbol: avatarMarkerStyle(key).mapSymbol,
          halo: avatarMarkerStyle(key).halo,
        });
      }
    }
  }

  for (const m of markers) {
    points.push({
      lat: m.lat,
      lon: m.lon,
      name: m.label,
      color: MARKER_COLOR,
      symbol: "diamond",
    });
  }
  return points;
}

function Map2D({
  pose,
  trajectory,
  uiAvatars = {},
  markers,
  visibleDroneIds,
  open,
  onOpenChange,
  skin = "night",
}: Map2DProps) {
  const showPanel = hasGpsAvatar(pose) || markers.length > 0;
  const origin = trajectory?.origin ?? pose?.origin;

  const poseAvatars = useMemo(() => {
    const out: Record<string, PoseAvatars> = {};
    if (!trajectory) return out;
    for (const [id, sources] of Object.entries(trajectory.drones)) {
      const stub: PoseAvatars = {};
      for (const key of Object.keys(sources)) {
        stub[key as keyof PoseAvatars] = { e: 0, n: 0, u: 0 };
      }
      out[id] = stub;
    }
    return out;
  }, [trajectory]);

  const t = pose?.t ?? 0;
  const tracks = useMemo(
    () =>
      stableMapTracks(
        trajectory,
        origin,
        poseAvatars,
        uiAvatars,
        visibleDroneIds,
        t,
      ),
    [trajectory, origin, poseAvatars, uiAvatars, visibleDroneIds, t],
  );

  if (!showPanel) return null;

  const points = currentPoints(pose, uiAvatars, markers, visibleDroneIds);
  const { data, layout } = mapFigure(points, tracks, {
    datarevision: pose?.t ?? 0,
    skin,
  });

  return (
    <div className="relative z-0 flex h-full w-80 shrink-0 flex-col overflow-hidden rounded border border-zinc-800">
      <button
        type="button"
        className="flex items-center justify-between px-2 py-1 text-left text-sm text-zinc-300 hover:bg-zinc-900"
        onClick={() => onOpenChange(!open)}
      >
        <span>2D map</span>
        <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <Plot
            data={data}
            layout={layout}
            config={{ responsive: true }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        </div>
      )}
    </div>
  );
}

export default memo(Map2D);
