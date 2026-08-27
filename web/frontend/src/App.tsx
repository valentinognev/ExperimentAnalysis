import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listExperiments, openExperiment, patchManifest, patchMarkers } from "./api";
import ChannelPlot from "./components/ChannelPlot";
import MarkerPanel from "./components/MarkerPanel";
import PlotBoard from "./components/PlotBoard";
import DroneList from "./components/DroneList";
import ExperimentBar from "./components/ExperimentBar";
import Timeline from "./components/Timeline";
import Map2D, { hasGpsAvatar } from "./components/Map2D";
import View3D, { type DronePose } from "./components/View3D";
import { shouldLoadCesium } from "./engineToggle";
import { downsampleHz } from "./downsample";
import { llaToEnu, newMarkerId, type Marker } from "./markers";
import { plotsOnSlugChange, type PlotDef } from "./plotBoard";
import type { EnuPos } from "./triad";
import { usePose } from "./usePose";
import { bannerText } from "./unsynced";
import { filterVisible, idsChanged, mergeDroneIds } from "./visibleDrones";

const View3DCesium = lazy(() => import("./components/View3DCesium"));

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
  const [vectorConfigs, setVectorConfigs] = useState<
    Record<string, { avatar?: string; scale?: number }>
  >({});
  const [engine3d, setEngine3d] = useState("plotly");
  const [mapLinked, setMapLinked] = useState(true);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [selectedMarkerIds, setSelectedMarkerIds] = useState<string[]>([]);
  const { pose, error: poseError } = usePose(slug, t, refreshToken);
  const [trailHistory, setTrailHistory] = useState<
    Record<string, TrailPoint[]>
  >({});
  const prevSlugRef = useRef<string | null>(null);
  const uiHydratedRef = useRef(false);
  const skipSaveRef = useRef(true);
  const mapLinkedFromManifestRef = useRef(false);
  const mapDefaultAppliedRef = useRef(false);

  const handleImported = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  useEffect(() => {
    setTrailHistory({});
    setT(0);
    setMarkers([]);
    setSelectedMarkerIds([]);
    mapDefaultAppliedRef.current = false;
    const cleared = plotsOnSlugChange(prevSlugRef.current, slug);
    if (cleared !== null) setPlots(cleared);
  }, [slug]);

  useEffect(() => {
    if (!slug) {
      setDroneIds([]);
      setVisibleIds(new Set());
      setPlots([]);
      setAvatars({});
      setVectorConfigs({});
      setEngine3d("plotly");
      setMapLinked(true);
      setMarkers([]);
      setSelectedMarkerIds([]);
      prevSlugRef.current = null;
      uiHydratedRef.current = false;
      skipSaveRef.current = true;
      mapLinkedFromManifestRef.current = false;
      mapDefaultAppliedRef.current = false;
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
          vectors?: Record<string, { avatar?: string; scale?: number }>;
          engine3d?: string;
          map_linked?: boolean;
          markers?: Marker[];
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
          setVectorConfigs(
            ui.vectors && typeof ui.vectors === "object" ? ui.vectors : {},
          );
          setMapLinked(
            ui.map_linked !== undefined ? Boolean(ui.map_linked) : false,
          );
          mapLinkedFromManifestRef.current = ui.map_linked !== undefined;
          mapDefaultAppliedRef.current = ui.map_linked !== undefined;
          setMarkers(Array.isArray(ui.markers) ? ui.markers : []);
          setSelectedMarkerIds([]);
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

  const markersKey = useMemo(() => JSON.stringify(markers), [markers]);

  useEffect(() => {
    if (!slug || !uiHydratedRef.current || skipSaveRef.current) return;

    const timer = setTimeout(() => {
      patchMarkers(slug, markers).catch(() => {});
    }, 300);

    return () => clearTimeout(timer);
  }, [slug, markersKey]);

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

  useEffect(() => {
    if (!pose || mapLinkedFromManifestRef.current || mapDefaultAppliedRef.current) {
      return;
    }
    setMapLinked(hasGpsAvatar(pose));
    mapDefaultAppliedRef.current = true;
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

  const unsyncedBanner = useMemo(
    () => (pose?.drones ? bannerText(pose.drones) : ""),
    [pose?.drones],
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
      .map(([id, d]) => {
        const cfg = vectorConfigs[id];
        const avatarKey = cfg?.avatar ?? "ekf_ned";
        const avatars = d.avatars!;
        const vectorBase =
          avatarKey === "gps" && avatars.gps
            ? avatars.gps
            : avatars.ekf_ned;
        return {
          id,
          pos: avatars.ekf_ned,
          attitude_q_xyzw: d.attitude_q_xyzw!,
          trail: downsampleTrail(trailHistory[id] ?? []),
          vectors: d.vectors?.velocity
            ? {
                velocity: d.vectors.velocity,
                scale: cfg?.scale ?? 1,
                base: vectorBase,
              }
            : undefined,
        };
      });
  }, [pose, trailHistory, visibleDroneIds, vectorConfigs]);

  const markerPositions = useMemo(() => {
    if (!pose?.origin) return [];
    const { lat, lon, alt_m } = pose.origin;
    return markers.map((m) => llaToEnu(m.lat, m.lon, m.alt_m, lat, lon, alt_m));
  }, [markers, pose?.origin]);

  const handleGroundClick = useCallback(
    (lla: { lat: number; lon: number; alt_m: number }) => {
      const id = newMarkerId();
      setMarkers((prev) => [
        ...prev,
        { id, label: `M${prev.length + 1}`, ...lla },
      ]);
    },
    [],
  );

  const handleMarkerLabelChange = useCallback((id: string, label: string) => {
    setMarkers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, label } : m)),
    );
  }, []);

  const handleMarkerRemove = useCallback((id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
    setSelectedMarkerIds((prev) => prev.filter((x) => x !== id));
  }, []);

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
        slug={slug}
        onPulled={handleImported}
      />
      {poseError && (
        <p className="px-4 text-sm text-red-400">Pose: {poseError}</p>
      )}
      {unsyncedBanner && (
        <p
          className="mx-4 mb-2 rounded border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-300"
          role="status"
        >
          {unsyncedBanner}
        </p>
      )}
      <div className="min-h-0 flex-1 p-4">
        <div className="flex h-[min(70vh,640px)] gap-4">
          <div className="min-w-0 flex-1 rounded border border-zinc-800">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-2 py-1">
              <span className="text-xs text-zinc-400">3D engine</span>
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-xs ${
                  engine3d === "plotly"
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-900"
                }`}
                onClick={() => setEngine3d("plotly")}
              >
                Plotly
              </button>
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-xs ${
                  engine3d === "cesium"
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-900"
                }`}
                onClick={() => setEngine3d("cesium")}
              >
                Cesium
              </button>
            </div>
            {shouldLoadCesium(engine3d) ? (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                    Loading globe…
                  </div>
                }
              >
                <View3DCesium drones={drones} origin={pose?.origin} />
              </Suspense>
            ) : (
              <View3D
                drones={drones}
                origin={pose?.origin}
                markerPositions={markerPositions}
                onGroundClick={handleGroundClick}
              />
            )}
          </div>
          <Map2D
            pose={pose}
            markers={markers}
            visibleDroneIds={visibleDroneIds}
            open={mapLinked}
            onOpenChange={setMapLinked}
          />
          <div className="w-56 shrink-0">
            <MarkerPanel
              markers={markers}
              selectedIds={selectedMarkerIds}
              onSelect={setSelectedMarkerIds}
              onLabelChange={handleMarkerLabelChange}
              onRemove={handleMarkerRemove}
            />
          </div>
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
