import Plot from "react-plotly.js";
import type { PoseResponse } from "../api";
import { hasAnyMapAvatar } from "../avatars";
import { enuToLla, type Marker } from "../markers";
import { mapFigure } from "../map2d";
import { droneColor } from "../droneColor";

type Map2DProps = {
  pose: PoseResponse | null;
  markers: Marker[];
  visibleDroneIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function hasGpsAvatar(pose: PoseResponse | null): boolean {
  if (!pose) return false;
  return hasAnyMapAvatar(pose.drones);
}

function mapAvatarPos(
  avatars: NonNullable<PoseResponse["drones"][string]["avatars"]>,
): { e: number; n: number; u: number } | undefined {
  return avatars.gps ?? avatars.sm_lla;
}

export default function Map2D({
  pose,
  markers,
  visibleDroneIds,
  open,
  onOpenChange,
}: Map2DProps) {
  const showPanel = hasGpsAvatar(pose) || markers.length > 0;
  if (!showPanel) return null;

  const origin = pose?.origin;
  const visible = new Set(visibleDroneIds);

  const points = [];
  if (pose && origin) {
    const droneEntries = Object.entries(pose.drones).filter(([id, d]) => {
      if (!visible.has(id)) return false;
      return mapAvatarPos(d.avatars ?? {}) !== undefined;
    });
    droneEntries.forEach(([id, d]) => {
      const enu = mapAvatarPos(d.avatars!)!;
      const lla = enuToLla(enu.e, enu.n, enu.u, origin.lat, origin.lon, origin.alt_m);
      points.push({
        lat: lla.lat,
        lon: lla.lon,
        name: `D${id}`,
        color: droneColor(id),
      });
    });
  }

  for (const m of markers) {
    points.push({
      lat: m.lat,
      lon: m.lon,
      name: m.label,
      color: "#facc15",
    });
  }

  const { data, layout } = mapFigure(points);

  return (
    <div className="flex w-80 shrink-0 flex-col rounded border border-zinc-800">
      <button
        type="button"
        className="flex items-center justify-between px-2 py-1 text-left text-sm text-zinc-300 hover:bg-zinc-900"
        onClick={() => onOpenChange(!open)}
      >
        <span>2D map</span>
        <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="min-h-0 flex-1">
          <Plot
            data={data}
            layout={{ ...layout, height: 280 }}
            config={{ responsive: true }}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      )}
    </div>
  );
}
