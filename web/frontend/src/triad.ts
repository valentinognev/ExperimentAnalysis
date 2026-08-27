import type { Data } from "plotly.js";

export type EnuPos = { e: number; n: number; u: number };

type QuatXyzw = [number, number, number, number];

const BODY_AXES: Array<{
  name: string;
  body: [number, number, number];
  color: string;
}> = [
  { name: "body x", body: [1, 0, 0], color: "red" },
  { name: "body y", body: [0, 1, 0], color: "green" },
  { name: "body z", body: [0, 0, 1], color: "blue" },
];

/** Rotate a body-frame vector into NED using xyzw quaternion (body→NED). */
function rotateBodyToNed(
  v: [number, number, number],
  q: QuatXyzw,
): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;

  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/** NED (n,e,d) → ENU (e,n,u); matches backend `ea.geo.ned_to_enu`. */
function nedToEnu(n: number, e: number, d: number): [number, number, number] {
  return [e, n, -d];
}

function bodyAxisEnu(
  axis: [number, number, number],
  q: QuatXyzw,
  scale: number,
): [number, number, number] {
  const [n, e, d] = rotateBodyToNed(axis, q);
  const [de, dn, du] = nedToEnu(n * scale, e * scale, d * scale);
  return [de, dn, du];
}

export function triadTraces(
  pos: EnuPos,
  q_xyzw: QuatXyzw,
  scale = 1,
): Data[] {
  return BODY_AXES.map(({ name, body, color }) => {
    const [de, dn, du] = bodyAxisEnu(body, q_xyzw, scale);
    return {
      type: "scatter3d",
      mode: "lines",
      name,
      x: [pos.e, pos.e + de],
      y: [pos.n, pos.n + dn],
      z: [pos.u, pos.u + du],
      line: { color, width: 4 },
    } satisfies Data;
  });
}
