import { memo, useRef, type MouseEvent } from "react";
import Plot from "react-plotly.js";
import type { Data, PlotHoverEvent, PlotMouseEvent } from "plotly.js";
import { groundPlaneExtent, groundPlaneTrace } from "../groundPlane";
import { triadTraces, type EnuPos } from "../triad";
import { sceneLayout } from "../view3dLayout";
import type { Origin } from "../markers";
import {
  groundClickToLla,
  isPlotDoubleClick,
  markerIdFromPlotPick,
  MARKER_COLOR,
  MARKER_OUTLINE_COLOR,
  MARKERS_TRACE_NAME,
  type PlotlyGroundClick,
} from "../markers";
import { droneColor } from "../droneColor";
import { avatarMarkerStyle } from "../avatarMarker";

type QuatXyzw = [number, number, number, number];

export { sceneLayout };

export type DronePose = {
  id: string;
  label?: string;
  pos: EnuPos;
  attitude_q_xyzw?: QuatXyzw;
  style?: "triad" | "point";
  trail?: EnuPos[];
  vectors?: {
    velocity: EnuPos;
    scale: number;
    base: EnuPos;
  };
};

/** Legend / label for an avatar: `ekf_ned` → `D2 ekf`. */
export function avatarLegendName(id: string, label?: string): string {
  const short = label === "ekf_ned" ? "ekf" : label;
  return short ? `D${id} ${short}` : `D${id}`;
}

/** Black ring on the EKF body so it is distinct from GPS / SM. */
export function avatarBodyOutline(
  label?: string,
): { color: string; width: number } | undefined {
  return avatarMarkerStyle(label).outline;
}

type MarkerEnu = EnuPos & { id: string };

type View3DProps = {
  drones: DronePose[];
  scale?: number;
  origin?: Origin;
  markerPositions?: MarkerEnu[];
  onGroundClick?: (lla: { lat: number; lon: number; alt_m: number }) => void;
  onMarkerRemove?: (id: string) => void;
};

function trailTrace(
  id: string,
  trail: EnuPos[],
  color: string,
  label?: string,
): Data {
  return {
    type: "scatter3d",
    mode: "lines+markers",
    name: `${avatarLegendName(id, label)} trail`,
    x: trail.map((p) => p.e),
    y: trail.map((p) => p.n),
    z: trail.map((p) => p.u),
    line: { color, width: 2 },
    marker: { size: 2, color },
    showlegend: true,
  };
}

function bodyTraces(
  name: string,
  pos: EnuPos,
  color: string,
  label?: string,
): Data[] {
  const style = avatarMarkerStyle(label);
  const traces: Data[] = [];
  if (style.halo && style.outline) {
    traces.push({
      type: "scatter3d",
      mode: "markers",
      name,
      legendgroup: name,
      x: [pos.e],
      y: [pos.n],
      z: [pos.u],
      marker: { size: style.size + 2, color: style.outline.color, symbol: style.symbol },
      showlegend: false,
    });
  }
  traces.push({
    type: "scatter3d",
    mode: "markers",
    name,
    legendgroup: name,
    x: [pos.e],
    y: [pos.n],
    z: [pos.u],
    marker: style.outline
      ? { size: style.size, color, symbol: style.symbol, line: style.outline }
      : { size: style.size, color, symbol: style.symbol },
    showlegend: true,
  });
  return traces;
}

function vectorTrace(
  base: EnuPos,
  velocity: EnuPos,
  scale: number,
  color: string,
  legendgroup: string,
): Data {
  const de = velocity.e * scale;
  const dn = velocity.n * scale;
  const du = velocity.u * scale;
  return {
    type: "scatter3d",
    mode: "lines",
    name: "velocity",
    legendgroup,
    x: [base.e, base.e + de],
    y: [base.n, base.n + dn],
    z: [base.u, base.u + du],
    line: { color, width: 4, dash: "dash" },
    showlegend: false,
  };
}

function View3D({
  drones,
  scale = 1,
  origin,
  markerPositions = [],
  onGroundClick,
  onMarkerRemove,
}: View3DProps) {
  const lastClickMsRef = useRef<number | null>(null);
  const hoverPickRef = useRef<PlotlyGroundClick | null>(null);
  const traces: Data[] = [];

  if (onGroundClick) {
    const enuForGround: EnuPos[] = [...markerPositions];
    for (const drone of drones) {
      enuForGround.push(drone.pos);
      if (drone.trail) enuForGround.push(...drone.trail);
    }
    traces.push(groundPlaneTrace(groundPlaneExtent(enuForGround)));
  }

  if (markerPositions.length > 0) {
    const xs = markerPositions.map((p) => p.e);
    const ys = markerPositions.map((p) => p.n);
    const zs = markerPositions.map((p) => p.u);
    const ids = markerPositions.map((p) => p.id);
    traces.push({
      type: "scatter3d",
      mode: "markers",
      name: MARKERS_TRACE_NAME,
      legendgroup: MARKERS_TRACE_NAME,
      x: xs,
      y: ys,
      z: zs,
      customdata: ids,
      marker: { size: 7, color: MARKER_OUTLINE_COLOR, symbol: "diamond" },
      showlegend: false,
    });
    traces.push({
      type: "scatter3d",
      mode: "markers",
      name: MARKERS_TRACE_NAME,
      legendgroup: MARKERS_TRACE_NAME,
      x: xs,
      y: ys,
      z: zs,
      customdata: ids,
      marker: {
        size: 5,
        color: MARKER_COLOR,
        symbol: "diamond",
        line: { color: MARKER_OUTLINE_COLOR, width: 2 },
      },
      showlegend: true,
    });
  }

  drones.forEach((drone) => {
    const color = droneColor(drone.id);
    const name = avatarLegendName(drone.id, drone.label);
    if (drone.trail && drone.trail.length > 0) {
      traces.push(trailTrace(drone.id, drone.trail, color, drone.label));
    }
    if (drone.style !== "point" && drone.attitude_q_xyzw) {
      for (const trace of triadTraces(
        drone.pos,
        drone.attitude_q_xyzw,
        scale,
      )) {
        traces.push({
          ...trace,
          name: `${name} ${trace.name ?? ""}`.trim(),
          legendgroup: name,
          showlegend: false,
        });
      }
    }
    traces.push(...bodyTraces(name, drone.pos, color, drone.label));
    if (drone.vectors?.velocity) {
      traces.push(
        vectorTrace(
          drone.vectors.base,
          drone.vectors.velocity,
          drone.vectors.scale,
          color,
          name,
        ),
      );
    }
  });

  const handleClick = (event: PlotMouseEvent) => {
    if (!origin || !onGroundClick) return;
    const now = Date.now();
    const dbl = isPlotDoubleClick(event.event, now, lastClickMsRef.current);
    if (!dbl) {
      lastClickMsRef.current = now;
      return;
    }
    lastClickMsRef.current = null;
    const pick = event as PlotlyGroundClick;
    if (markerIdFromPlotPick(pick)) return;
    const lla = groundClickToLla(pick, origin);
    if (lla) onGroundClick(lla);
  };

  const handleHover = (event: PlotHoverEvent) => {
    hoverPickRef.current = event as PlotlyGroundClick;
  };

  const handleUnhover = () => {
    hoverPickRef.current = null;
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (!onMarkerRemove) return;
    const id = markerIdFromPlotPick(hoverPickRef.current ?? {});
    if (id) onMarkerRemove(id);
  };

  const datarevision = drones
    .map(
      (d) =>
        `${d.id}:${d.pos.e}:${d.pos.n}:${d.pos.u}:${(d.attitude_q_xyzw ?? []).join(",")}`,
    )
    .join("|");

  return (
    <div className="h-full w-full min-h-0 overflow-hidden" onContextMenu={handleContextMenu}>
      <Plot
        data={traces}
        layout={sceneLayout({ datarevision })}
        config={{ responsive: true, doubleClick: false }}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
        onClick={handleClick}
        onHover={handleHover}
        onUnhover={handleUnhover}
      />
    </div>
  );
}

export default memo(View3D);
