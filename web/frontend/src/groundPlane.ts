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

/** Clickable u=0 ground quad for Plotly scatter3d scene clicks. */
export function groundPlaneTrace(extent: GroundPlaneExtent): Data {
  const { eMin, eMax, nMin, nMax } = extent;
  return {
    type: "mesh3d",
    name: "Ground",
    x: [eMin, eMax, eMax, eMin],
    y: [nMin, nMin, nMax, nMax],
    z: [0, 0, 0, 0],
    i: [0, 0, 1],
    j: [1, 2, 2],
    k: [2, 3, 3],
    color: "rgba(128,128,128,0.15)",
    flatshading: true,
    hoverinfo: "skip",
    showlegend: false,
  };
}
