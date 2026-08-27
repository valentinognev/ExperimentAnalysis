import type { Data } from "plotly.js";
import type { EnuPos } from "./triad";

export type GroundPlaneExtent = {
  eMin: number;
  eMax: number;
  nMin: number;
  nMax: number;
};

export const DEFAULT_GROUND_HALF_EXTENT_M = 200;
export const GROUND_PLANE_PADDING_M = 20;
export const GROUND_PLANE_GRID_SIZE = 21;

/** E/N bbox for the ground plane; ±halfExtent when empty, else trace bbox + padding. */
export function groundPlaneExtent(
  positions: EnuPos[],
  halfExtent = DEFAULT_GROUND_HALF_EXTENT_M,
  padding = GROUND_PLANE_PADDING_M,
): GroundPlaneExtent {
  if (positions.length === 0) {
    return {
      eMin: -halfExtent,
      eMax: halfExtent,
      nMin: -halfExtent,
      nMax: halfExtent,
    };
  }

  let eMin = Infinity;
  let eMax = -Infinity;
  let nMin = Infinity;
  let nMax = -Infinity;
  for (const { e, n } of positions) {
    if (e < eMin) eMin = e;
    if (e > eMax) eMax = e;
    if (n < nMin) nMin = n;
    if (n > nMax) nMax = n;
  }
  return {
    eMin: eMin - padding,
    eMax: eMax + padding,
    nMin: nMin - padding,
    nMax: nMax + padding,
  };
}

/** Dense u=0 ground surface for Plotly gl3d scene picks (hoverinfo must not be "skip"). */
export function groundPlaneTrace(extent: GroundPlaneExtent): Data {
  const { eMin, eMax, nMin, nMax } = extent;
  const n = GROUND_PLANE_GRID_SIZE;
  const x = Array.from({ length: n }, (_, i) => eMin + ((eMax - eMin) * i) / (n - 1));
  const y = Array.from({ length: n }, (_, i) => nMin + ((nMax - nMin) * i) / (n - 1));
  const z = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  return {
    type: "surface",
    name: "Ground",
    x,
    y,
    z,
    colorscale: [
      [0, "rgba(128,128,128,0.15)"],
      [1, "rgba(128,128,128,0.15)"],
    ],
    showscale: false,
    hoverinfo: "none",
    showlegend: false,
  };
}
