import Plot from "react-plotly.js";
import type { PoseResponse } from "../api";
import { enuToLla, type Marker } from "../markers";
import { mapFigure } from "../map2d";

const DRONE_COLORS = ["#f97316", "#22d3ee", "#a78bfa", "#f472b6"];

type Map2DProps = {
  pose: PoseResponse | null;
  markers: Marker[];
  visibleDroneIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function hasGpsAvatar(pose: PoseResponse | null): boolean {
  if (!pose) return false;
  return Object.values(pose.drones).some((d) => d.avatars?.gps !== undefined);
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
    const droneEntries = Object.entries(pose.drones).filter(
      ([id, d]) => visible.has(id) && d.present && d.avatars?.gps,
    );
    droneEntries.forEach(([id, d], index) => {
      const gps = d.avatars!.gps!;
      const lla = enuToLla(gps.e, gps.n, gps.u, origin.lat, origin.lon, origin.alt_m);
      points.push({
        lat: lla.lat,
        lon: lla.lon,
        name: `D${id}`,
        color: DRONE_COLORS[index % DRONE_COLORS.length],
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
