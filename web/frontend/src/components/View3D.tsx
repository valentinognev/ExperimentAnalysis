import Plot from "react-plotly.js";
import { triadTraces, type EnuPos } from "../triad";
import { sceneLayout } from "../view3dLayout";

type QuatXyzw = [number, number, number, number];

export { sceneLayout };

type View3DProps = {
  pos: EnuPos;
  attitude_q_xyzw: QuatXyzw;
  scale?: number;
};

export default function View3D({
  pos,
  attitude_q_xyzw,
  scale = 1,
}: View3DProps) {
  const traces = triadTraces(pos, attitude_q_xyzw, scale);

  return (
    <Plot
      data={traces}
      layout={sceneLayout()}
      config={{ responsive: true }}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
