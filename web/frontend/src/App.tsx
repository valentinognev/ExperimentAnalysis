import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listExperiments } from "./api";
import ChannelPlot from "./components/ChannelPlot";
import DroneList from "./components/DroneList";
import ExperimentBar from "./components/ExperimentBar";
import Timeline from "./components/Timeline";
import View3D, { type DronePose } from "./components/View3D";
import { downsampleHz } from "./downsample";
import type { EnuPos } from "./triad";
import { usePose } from "./usePose";
import { filterVisible, idsChanged, mergeDroneIds } from "./visibleDrones";

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
  const [refreshToken, setRefreshToken] = useState(0);
  const [t, setT] = useState(0);
  const [droneIds, setDroneIds] = useState<string[]>([]);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const { pose, error: poseError } = usePose(slug, t, refreshToken);
  const [trailHistory, setTrailHistory] = useState<
    Record<string, TrailPoint[]>
  >({});
  const prevSlugRef = useRef<string | null>(null);

  const handleImported = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  useEffect(() => {
    setTrailHistory({});
    setT(0);
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setDroneIds([]);
      setVisibleIds(new Set());
      prevSlugRef.current = null;
      return;
    }

    const slugChanged = prevSlugRef.current !== slug;
    prevSlugRef.current = slug;

    let cancelled = false;
    listExperiments()
      .then((list) => {
        if (cancelled) return;
        const exp = list.find((e) => e.slug === slug);
        const listed = (exp?.drone_ids ?? []).map(String);
        if (slugChanged) {
          setDroneIds(listed);
          setVisibleIds(new Set(listed));
        } else {
          setDroneIds((prev) => {
            const merged = mergeDroneIds(listed, prev);
            return idsChanged(prev, merged) ? merged : prev;
          });
          setVisibleIds((prev) => {
            const next = new Set(prev);
            let changed = false;
            for (const id of listed) {
              if (!prev.has(id)) {
                next.add(id);
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (slugChanged) {
          setDroneIds([]);
          setVisibleIds(new Set());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug, refreshToken]);

  useEffect(() => {
    if (!pose?.drones) return;
    const poseIds = Object.keys(pose.drones);
    setDroneIds((prev) => {
      const merged = mergeDroneIds(prev, poseIds);
      return idsChanged(prev, merged) ? merged : prev;
    });
    setVisibleIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of poseIds) {
        if (!prev.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pose]);

  const handleDroneToggle = useCallback((id: string, checked: boolean) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const visibleDroneIds = useMemo(
    () => filterVisible(droneIds, visibleIds),
    [droneIds, visibleIds],
  );

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
    const visible = new Set(visibleDroneIds);
    return Object.entries(pose.drones)
      .filter(
        ([id, d]) =>
          visible.has(id) &&
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
  }, [pose, trailHistory, visibleDroneIds]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <h1 className="px-4 pt-4 text-xl font-semibold">ExperimentAnalysis</h1>
      <ExperimentBar
        slug={slug}
        onSlugChange={setSlug}
        onImported={handleImported}
      />
      <DroneList
        droneIds={droneIds}
        visible={visibleIds}
        onToggle={handleDroneToggle}
      />
      {poseError && (
        <p className="px-4 text-sm text-red-400">Pose: {poseError}</p>
      )}
      <div className="min-h-0 flex-1 p-4">
        <div className="h-[min(70vh,640px)] rounded border border-zinc-800">
          <View3D drones={drones} />
        </div>
      </div>
      <ChannelPlot slug={slug} visibleDroneIds={visibleDroneIds} t={t} />
      <Timeline t={t} tMax={60} onTChange={setT} />
    </div>
  );
}
