import { useEffect, useMemo, useState } from "react";
import ExperimentBar from "./components/ExperimentBar";
import View3D, { type DronePose } from "./components/View3D";
import { downsampleHz } from "./downsample";
import type { EnuPos } from "./triad";
import { usePose } from "./usePose";

type TrailPoint = { t: number; pos: EnuPos };

function downsampleTrail(
  points: TrailPoint[],
  maxHz = 20,
): EnuPos[] {
  if (points.length === 0) return [];
  const ts = points.map((p) => p.t);
  const keep = downsampleHz(ts, maxHz);
  return points.filter((_, i) => keep[i]).map((p) => p.pos);
}

export default function App() {
  const [slug, setSlug] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const { pose, error: poseError } = usePose(slug, t);
  const [trailHistory, setTrailHistory] = useState<
    Record<string, TrailPoint[]>
  >({});

  useEffect(() => {
    setTrailHistory({});
    setT(0);
  }, [slug]);

  useEffect(() => {
    if (!pose) return;

    setTrailHistory((prev) => {
      const next = { ...prev };
      for (const [id, drone] of Object.entries(pose.drones)) {
        if (!drone.present || !drone.avatars?.ekf_ned) continue;
        const pts = [...(next[id] ?? [])];
        const pos = drone.avatars.ekf_ned;
        if (pts.length > 0 && pts[pts.length - 1].t === pose.t) {
          pts[pts.length - 1] = { t: pose.t, pos };
        } else {
          pts.push({ t: pose.t, pos });
        }
        next[id] = pts;
      }
      return next;
    });
  }, [pose]);

  const drones = useMemo((): DronePose[] => {
    if (!pose) return [];
    return Object.entries(pose.drones)
      .filter(
        ([, d]) =>
          d.present &&
          d.attitude_q_xyzw !== undefined &&
          d.avatars?.ekf_ned !== undefined,
      )
      .map(([id, d]) => ({
        id,
        pos: d.avatars!.ekf_ned,
        attitude_q_xyzw: d.attitude_q_xyzw!,
        trail: downsampleTrail(trailHistory[id] ?? []),
      }));
  }, [pose, trailHistory]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <h1 className="px-4 pt-4 text-xl font-semibold">ExperimentAnalysis</h1>
      <ExperimentBar slug={slug} onSlugChange={setSlug} />
      {poseError && (
        <p className="px-4 text-sm text-red-400">Pose: {poseError}</p>
      )}
      <div className="min-h-0 flex-1 p-4">
        <div className="h-[min(70vh,640px)] rounded border border-zinc-800">
          <View3D drones={drones} />
        </div>
      </div>
    </div>
  );
}
