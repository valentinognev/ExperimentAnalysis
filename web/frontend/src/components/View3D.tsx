import Plot from "react-plotly.js";
import type { Data, PlotMouseEvent } from "plotly.js";
import { groundPlaneExtent, groundPlaneTrace } from "../groundPlane";
import { triadTraces, type EnuPos } from "../triad";
import { sceneLayout } from "../view3dLayout";
import type { Origin } from "../markers";
import { groundClickToLla, type PlotlyGroundClick } from "../markers";

type QuatXyzw = [number, number, number, number];

export { sceneLayout };

const DRONE_COLORS = ["#f97316", "#22d3ee", "#a78bfa", "#f472b6"];

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

type View3DProps = {
  drones: DronePose[];
  scale?: number;
  origin?: Origin;
  markerPositions?: EnuPos[];
  onGroundClick?: (lla: { lat: number; lon: number; alt_m: number }) => void;
};

function trailTrace(
  id: string,
  trail: EnuPos[],
  color: string,
): Data {
  return {
    type: "scatter3d",
    mode: "lines+markers",
    name: `D${id} trail`,
    x: trail.map((p) => p.e),
    y: trail.map((p) => p.n),
    z: trail.map((p) => p.u),
    line: { color, width: 2 },
    marker: { size: 2, color },
    showlegend: true,
  };
}

function vectorTrace(
  base: EnuPos,
  velocity: EnuPos,
  scale: number,
  color: string,
): Data {
  const de = velocity.e * scale;
  const dn = velocity.n * scale;
  const du = velocity.u * scale;
  return {
    type: "scatter3d",
    mode: "lines",
    name: "velocity",
    x: [base.e, base.e + de],
    y: [base.n, base.n + dn],
    z: [base.u, base.u + du],
    line: { color, width: 4, dash: "dash" },
    showlegend: false,
  };
}

export default function View3D({
  drones,
  scale = 1,
  origin,
  markerPositions = [],
  onGroundClick,
}: View3DProps) {
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
    traces.push({
      type: "scatter3d",
      mode: "markers",
      name: "Markers",
      x: markerPositions.map((p) => p.e),
      y: markerPositions.map((p) => p.n),
      z: markerPositions.map((p) => p.u),
      marker: { size: 5, color: "#facc15", symbol: "diamond" },
      showlegend: true,
    });
  }

  drones.forEach((drone, index) => {
    const color = DRONE_COLORS[index % DRONE_COLORS.length];
    const namePrefix = drone.label
      ? `D${drone.id} ${drone.label}`
      : `D${drone.id}`;
    if (drone.trail && drone.trail.length > 0) {
      traces.push(trailTrace(drone.id, drone.trail, color));
    }
    if (drone.style === "point" || !drone.attitude_q_xyzw) {
      traces.push({
        type: "scatter3d",
        mode: "markers",
        name: namePrefix,
        x: [drone.pos.e],
        y: [drone.pos.n],
        z: [drone.pos.u],
        marker: { size: 6, color },
        showlegend: true,
      });
    } else {
      const triads = triadTraces(drone.pos, drone.attitude_q_xyzw, scale);
      for (const trace of triads) {
        traces.push({
          ...trace,
          name: `${namePrefix} ${trace.name ?? ""}`.trim(),
        });
      }
    }
    if (drone.vectors?.velocity) {
      traces.push(
        vectorTrace(
          drone.vectors.base,
          drone.vectors.velocity,
          drone.vectors.scale,
          color,
        ),
      );
    }
  });

  const handleClick = (event: PlotMouseEvent) => {
    if (!origin || !onGroundClick) return;
    const lla = groundClickToLla(event as PlotlyGroundClick, origin);
    if (lla) onGroundClick(lla);
  };

  const datarevision = drones
    .map(
      (d) =>
        `${d.id}:${d.pos.e}:${d.pos.n}:${d.pos.u}:${(d.attitude_q_xyzw ?? []).join(",")}`,
    )
    .join("|");

  return (
    <Plot
      data={traces}
      layout={sceneLayout({ datarevision })}
      config={{ responsive: true }}
      style={{ width: "100%", height: "100%" }}
      onClick={handleClick}
    />
  );
}
