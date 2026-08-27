import Plot from "react-plotly.js";
import type { Data, PlotMouseEvent } from "plotly.js";
import { groundPlaneExtent, groundPlaneTrace } from "../groundPlane";
import { triadTraces, type EnuPos } from "../triad";
import { sceneLayout } from "../view3dLayout";
import type { Origin } from "../markers";
import { groundClickToLla } from "../markers";

type QuatXyzw = [number, number, number, number];

export { sceneLayout };

const DRONE_COLORS = ["#f97316", "#22d3ee", "#a78bfa", "#f472b6"];

export type DronePose = {
  id: string;
  pos: EnuPos;
  attitude_q_xyzw: QuatXyzw;
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
    if (drone.trail && drone.trail.length > 0) {
      traces.push(trailTrace(drone.id, drone.trail, color));
    }
    const triads = triadTraces(drone.pos, drone.attitude_q_xyzw, scale);
    for (const trace of triads) {
      traces.push({
        ...trace,
        name: `D${drone.id} ${trace.name ?? ""}`.trim(),
      });
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
    const lla = groundClickToLla(event, origin);
    if (lla) onGroundClick(lla);
  };

  return (
    <Plot
      data={traces}
      layout={sceneLayout()}
      config={{ responsive: true }}
      style={{ width: "100%", height: "100%" }}
      onClick={handleClick}
    />
  );
}
