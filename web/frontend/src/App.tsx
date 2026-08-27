import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listExperiments, openExperiment, patchManifest } from "./api";
import ChannelPlot from "./components/ChannelPlot";
import PlotBoard from "./components/PlotBoard";
import DroneList from "./components/DroneList";
import ExperimentBar from "./components/ExperimentBar";
import Timeline from "./components/Timeline";
import View3D, { type DronePose } from "./components/View3D";
import { downsampleHz } from "./downsample";
import { plotsOnSlugChange, type PlotDef } from "./plotBoard";
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
  const [plots, setPlots] = useState<PlotDef[]>([]);
  const [avatars, setAvatars] = useState<Record<string, unknown>>({});
  const [engine3d, setEngine3d] = useState("plotly");
  const [mapLinked, setMapLinked] = useState(true);
  const { pose, error: poseError } = usePose(slug, t, refreshToken);
  const [trailHistory, setTrailHistory] = useState<
    Record<string, TrailPoint[]>
  >({});
  const prevSlugRef = useRef<string | null>(null);
  const uiHydratedRef = useRef(false);
  const skipSaveRef = useRef(true);

  const handleImported = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  useEffect(() => {
    setTrailHistory({});
    setT(0);
    const cleared = plotsOnSlugChange(prevSlugRef.current, slug);
    if (cleared !== null) setPlots(cleared);
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setDroneIds([]);
      setVisibleIds(new Set());
      setPlots([]);
      setAvatars({});
      setEngine3d("plotly");
      setMapLinked(true);
      prevSlugRef.current = null;
      uiHydratedRef.current = false;
      skipSaveRef.current = true;
      return;
    }

    const slugChanged = prevSlugRef.current !== slug;
    if (slugChanged) prevSlugRef.current = slug;

    let cancelled = false;
    skipSaveRef.current = true;
    uiHydratedRef.current = false;

    Promise.all([openExperiment(slug), listExperiments()])
      .then(([detail, list]) => {
        if (cancelled) return;
        const exp = list.find((e) => e.slug === slug);
        const listed = (exp?.drone_ids ?? []).map(String);
        const ui = (detail.manifest.ui ?? {}) as {
          visible_drone_ids?: (string | number)[];
          plots?: PlotDef[];
          avatars?: Record<string, unknown>;
          engine3d?: string;
          map_linked?: boolean;
        };

        if (slugChanged) {
          setDroneIds(listed);
          const saved = ui.visible_drone_ids ?? [];
          setVisibleIds(
            new Set(saved.length > 0 ? saved.map(String) : listed),
          );
          setPlots(Array.isArray(ui.plots) ? ui.plots : []);
          setEngine3d(typeof ui.engine3d === "string" ? ui.engine3d : "plotly");
          setAvatars(
            ui.avatars && typeof ui.avatars === "object" ? ui.avatars : {},
          );
          setMapLinked(
            ui.map_linked !== undefined ? Boolean(ui.map_linked) : true,
          );
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

        uiHydratedRef.current = true;
        queueMicrotask(() => {
          skipSaveRef.current = false;
        });
      })
      .catch(() => {
        if (cancelled) return;
        if (slugChanged) {
          setDroneIds([]);
          setVisibleIds(new Set());
          setPlots([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug, refreshToken]);

  const visibleIdsKey = useMemo(
    () => [...visibleIds].sort().join(","),
    [visibleIds],
  );

  useEffect(() => {
    if (!slug || !uiHydratedRef.current || skipSaveRef.current) return;

    const timer = setTimeout(() => {
      patchManifest(slug, {
        ui: {
          visible_drone_ids: [...visibleIds].map((id) => {
            const n = Number(id);
            return Number.isNaN(n) ? id : n;
          }),
          avatars,
          plots,
          engine3d,
          map_linked: mapLinked,
        },
      }).catch(() => {});
    }, 300);

    return () => clearTimeout(timer);
  }, [slug, visibleIdsKey, plots, avatars, engine3d, mapLinked]);

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
      <ChannelPlot
        slug={slug}
        visibleDroneIds={visibleDroneIds}
        t={t}
        refreshToken={refreshToken}
      />
      <PlotBoard
        slug={slug}
        t={t}
        refreshToken={refreshToken}
        plots={plots}
        onPlotsChange={setPlots}
      />
      <Timeline t={t} tMax={60} onTChange={setT} />
    </div>
  );
}
