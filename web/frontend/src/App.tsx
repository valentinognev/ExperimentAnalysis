import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDuration, getTrajectory, listExperiments, openExperiment, patchManifest, patchMarkers, type TrajectoryResponse } from "./api";
import { hostPatch, hostsFromManifest } from "./hosts";
import { sshReadyFromManifest } from "./sshReady";
import { summariesFromManifest, type DroneSummary } from "./droneSummary";
import {
  availableAvatarKeys,
  avatarUsesTriad,
  enabledAvatarKeys,
  hasAnyMapAvatar,
  toggleAvatarKeys,
  type AvatarKey,
} from "./avatars";
import ChannelPlot from "./components/ChannelPlot";
import MarkerPanel from "./components/MarkerPanel";
import PlotBoard from "./components/PlotBoard";
import DroneList from "./components/DroneList";
import ExperimentBar from "./components/ExperimentBar";
import Timeline from "./components/Timeline";
import ReplayTab from "./components/ReplayTab";
import WorkspaceTabs from "./components/WorkspaceTabs";
import { DEFAULT_TAB, type WorkspaceTab } from "./workspaceTab";
import Map2D from "./components/Map2D";
import View3D, { type DronePose } from "./components/View3D";
import { shouldLoadCesium } from "./engineToggle";
import { useSkin } from "./SkinContext";
import SkinToggle from "./components/SkinToggle";
import { llaToEnu, newMarkerId, type Marker } from "./markers";
import { plotsOnSlugChange, type PlotDef } from "./plotBoard";
import { sliceTrail } from "./trail";
import { usePose } from "./usePose";
import { bannerText } from "./unsynced";
import {
  droneCountFromIds,
  filterVisible,
  idsChanged,
  mergeDroneIds,
} from "./visibleDrones";
import { orderedDroneIds } from "./droneRows";
import { isReplayId, physicalId } from "./replayId";
import {
  parseSyncMode,
  physicalSyncIds,
  rebaseOffsets,
  type SyncMode,
} from "./syncMode";

const View3DCesium = lazy(() => import("./components/View3DCesium"));

function idsFromManifestDrones(drones: unknown): string[] {
  if (!Array.isArray(drones)) return [];
  const out: string[] = [];
  for (const raw of drones) {
    if (!raw || typeof raw !== "object") continue;
    const id = (raw as { id?: unknown }).id;
    if (id === undefined || id === null) continue;
    out.push(String(id));
  }
  return out;
}

function rowsForPhysicalCount(ids: string[], physicalCount: number): string[] {
  const cap = physicalCount > 0 ? physicalCount : droneCountFromIds(ids);
  if (cap < 1) return [];
  return orderedDroneIds(ids, cap);
}

function idFitsCount(id: string, cap: number): boolean {
  const phys = physicalId(id);
  if (phys === null) return false;
  if (cap < 1) return true;
  return phys >= 1 && phys <= cap;
}

/** Replay ids come from combined/manifest only; prev may keep extra physical slots. */
function rowsForRefresh(combined: string[], prev: string[], cap: number): string[] {
  const prevPhysical = prev.filter((id) => !isReplayId(id));
  return rowsForPhysicalCount(mergeDroneIds(combined, prevPhysical), cap);
}

function dropStaleReplayKeys<T>(
  map: Record<string, T>,
  live: Set<string>,
): Record<string, T> {
  let changed = false;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(map)) {
    if (isReplayId(key) && !live.has(key)) {
      changed = true;
      continue;
    }
    next[key] = value;
  }
  return changed ? next : map;
}

function dropStaleReplayPlots(plots: PlotDef[], live: Set<string>): PlotDef[] {
  const next = plots.filter((plot) => {
    const channels = plot.channels ?? [];
    return !channels.some((ch) => {
      const id = ch.split(".")[0] ?? "";
      return isReplayId(id) && !live.has(id);
    });
  });
  return next.length === plots.length ? plots : next;
}

export default function App() {
  const { skin } = useSkin();
  const [slug, setSlug] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>(DEFAULT_TAB);
  const [keepReplaySlug, setKeepReplaySlug] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Record<string, unknown>>({});
  const [experimentName, setExperimentName] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [t, setT] = useState(0);
  const [tMax, setTMax] = useState(60);
  const [droneIds, setDroneIds] = useState<string[]>([]);
  const [hosts, setHosts] = useState<Record<string, string>>({});
  const [sshReady, setSshReady] = useState<Record<string, boolean>>({});
  const [summaries, setSummaries] = useState<Record<string, DroneSummary>>({});
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
  const [syncMode, setSyncMode] = useState<SyncMode>("arm");
  const [mainDroneId, setMainDroneId] = useState("");
  const [syncOffsets, setSyncOffsets] = useState<Record<string, number>>({});
  const { pose, error: poseError } = usePose(slug, t, refreshToken);
  const [trajectory, setTrajectory] = useState<TrajectoryResponse | null>(null);
  const prevSlugRef = useRef<string | null>(null);
  const uiHydratedRef = useRef(false);
  const skipSaveRef = useRef(true);
  const mapLinkedFromManifestRef = useRef(false);
  const mapDefaultAppliedRef = useRef(false);

  const handlePulled = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  const handleHostCommit = useCallback(
    (id: string, host: string) => {
      if (!slug) return;
      const trimmed = host.trim();
      setHosts((prev) => ({ ...prev, [id]: trimmed }));
      patchManifest(slug, hostPatch(id, trimmed)).catch(() => {});
    },
    [slug],
  );

  const persistSync = useCallback(
    async (mode: SyncMode, main: string, offsets: Record<string, number>) => {
      if (!slug) return;
      try {
        await patchManifest(slug, {
          sync: {
            mode,
            main_drone_id: main,
            manual_offsets_s: offsets,
          },
        });
        setRefreshToken((n) => n + 1);
      } catch {
        // Keep local sync state; do not refetch stale pose/trajectory.
      }
    },
    [slug],
  );

  const handleSyncModeChange = useCallback(
    (mode: SyncMode) => {
      setSyncMode(mode);
      void persistSync(mode, mainDroneId, syncOffsets);
    },
    [mainDroneId, persistSync, syncOffsets],
  );

  const handleMainDroneChange = useCallback(
    (id: string) => {
      const ids = physicalSyncIds(droneIds);
      const nextOffsets = rebaseOffsets(syncOffsets, id, ids);
      setMainDroneId(id);
      setSyncOffsets(nextOffsets);
      void persistSync(syncMode, id, nextOffsets);
    },
    [droneIds, persistSync, syncMode, syncOffsets],
  );

  const handleOffsetChange = useCallback(
    (id: string, value: number) => {
      const ids = physicalSyncIds(droneIds);
      const next: Record<string, number> = {};
      for (const pid of ids) {
        next[pid] = syncOffsets[pid] ?? 0;
      }
      next[id] = value;
      if (mainDroneId) next[mainDroneId] = 0;
      setSyncOffsets(next);
      void persistSync(syncMode, mainDroneId, next);
    },
    [droneIds, mainDroneId, persistSync, syncMode, syncOffsets],
  );

  useEffect(() => {
    setT(0);
    setTMax(60);
    setMarkers([]);
    setSelectedMarkerIds([]);
    setKeepReplaySlug(null);
    mapDefaultAppliedRef.current = false;
    const cleared = plotsOnSlugChange(prevSlugRef.current, slug);
    if (cleared !== null) setPlots(cleared);
  }, [slug]);

  useEffect(() => {
    if (tab === "replay" && slug) setKeepReplaySlug(slug);
  }, [tab, slug]);

  useEffect(() => {
    if (!slug) {
      setExperimentName("");
      setManifest({});
      setDroneIds([]);
      setHosts({});
      setSshReady({});
      setSummaries({});
      setVisibleIds(new Set());
      setPlots([]);
      setAvatars({});
      setVectorConfigs({});
      setEngine3d("plotly");
      setMapLinked(true);
      setMarkers([]);
      setSelectedMarkerIds([]);
      setSyncMode("arm");
      setMainDroneId("");
      setSyncOffsets({});
      prevSlugRef.current = null;
      uiHydratedRef.current = false;
      skipSaveRef.current = true;
      mapLinkedFromManifestRef.current = false;
      mapDefaultAppliedRef.current = false;
      return;
    }

    const slugChanged = prevSlugRef.current !== slug;
    if (slugChanged) {
      prevSlugRef.current = slug;
      setExperimentName("");
    }

    let cancelled = false;
    skipSaveRef.current = true;
    uiHydratedRef.current = false;

    Promise.all([openExperiment(slug), listExperiments()])
      .then(([detail, list]) => {
        if (cancelled) return;
        const exp = list.find((e) => e.slug === slug);
        const listed = (exp?.drone_ids ?? []).map(String);
        const manifestIds = idsFromManifestDrones(detail.manifest.drones);
        const combined = mergeDroneIds(listed, manifestIds);
        const ui = (detail.manifest.ui ?? {}) as {
          visible_drone_ids?: (string | number)[];
          plots?: PlotDef[];
          avatars?: Record<string, unknown>;
          vectors?: Record<string, { avatar?: string; scale?: number }>;
          engine3d?: string;
          map_linked?: boolean;
          markers?: Marker[];
        };

        const manifestName = detail.manifest.name;
        setExperimentName(typeof manifestName === "string" ? manifestName : "");
        setManifest(detail.manifest ?? {});
        setHosts(hostsFromManifest(detail.manifest.drones));
        setSshReady(sshReadyFromManifest(detail.manifest.drones));
        setSummaries(summariesFromManifest(detail.manifest.drones));

        if (slugChanged) {
          const cap = droneCountFromIds(combined);
          const rows = rowsForPhysicalCount(combined, cap);
          setDroneIds(rows);
          const saved = ui.visible_drone_ids ?? [];
          setVisibleIds(
            new Set(saved.length > 0 ? saved.map(String) : rows),
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

          const syncRaw =
            detail.manifest.sync && typeof detail.manifest.sync === "object"
              ? (detail.manifest.sync as Record<string, unknown>)
              : {};
          const mode = parseSyncMode(syncRaw.mode);
          setSyncMode(mode);
          const physical = physicalSyncIds(rows);
          const mainRaw = syncRaw.main_drone_id;
          const mainFromManifest =
            mainRaw !== undefined && mainRaw !== null && String(mainRaw) !== ""
              ? String(mainRaw)
              : "";
          setMainDroneId(
            mainFromManifest && physical.includes(mainFromManifest)
              ? mainFromManifest
              : (physical[0] ?? ""),
          );
          const offsRaw = syncRaw.manual_offsets_s;
          const nextOffsets: Record<string, number> = {};
          if (offsRaw && typeof offsRaw === "object") {
            for (const [key, value] of Object.entries(
              offsRaw as Record<string, unknown>,
            )) {
              const n = Number(value);
              if (Number.isFinite(n)) nextOffsets[String(key)] = n;
            }
          }
          setSyncOffsets(nextOffsets);
        } else {
          const listedMax = droneCountFromIds(combined);
          const liveReplays = new Set(combined.filter((id) => isReplayId(id)));
          setDroneIds((prev) => {
            const prevMax = droneCountFromIds(prev);
            const cap =
              listedMax > 0 && listedMax < prevMax
                ? listedMax
                : Math.max(listedMax, prevMax);
            const merged = rowsForRefresh(combined, prev, cap);
            return idsChanged(prev, merged) ? merged : prev;
          });
          setVisibleIds((prev) => {
            const cap =
              listedMax > 0 ? listedMax : droneCountFromIds(combined);
            const rows = rowsForPhysicalCount(combined, cap);
            const rowSet = new Set(rows);
            const next = new Set<string>();
            let changed = false;
            for (const id of prev) {
              if (isReplayId(id) && !rowSet.has(id)) {
                changed = true;
                continue;
              }
              next.add(id);
            }
            for (const id of rows) {
              if (!next.has(id)) {
                next.add(id);
                changed = true;
              }
            }
            return changed ? next : prev;
          });
          setAvatars((prev) => dropStaleReplayKeys(prev, liveReplays));
          setVectorConfigs((prev) => dropStaleReplayKeys(prev, liveReplays));
          setPlots((prev) => dropStaleReplayPlots(prev, liveReplays));
        }

        uiHydratedRef.current = true;
        queueMicrotask(() => {
          skipSaveRef.current = false;
        });
      })
      .catch(() => {
        if (cancelled) return;
        if (slugChanged) {
          setExperimentName("");
          setManifest({});
          setDroneIds([]);
          setHosts({});
          setSshReady({});
          setSummaries({});
          setVisibleIds(new Set());
          setPlots([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug, refreshToken]);

  useEffect(() => {
    if (!slug) {
      setTMax(60);
      return;
    }
    let cancelled = false;
    getDuration(slug)
      .then((data) => {
        if (!cancelled) {
          setTMax(Math.max(1, data.t_max_s));
        }
      })
      .catch(() => {
        if (!cancelled) setTMax(60);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, refreshToken]);

  useEffect(() => {
    if (!slug) {
      setTrajectory(null);
      return;
    }
    let cancelled = false;
    getTrajectory(slug)
      .then((data) => {
        if (!cancelled) setTrajectory(data);
      })
      .catch(() => {
        if (!cancelled) setTrajectory(null);
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
      const cap = droneCountFromIds(prev);
      const allowed = poseIds.filter((id) => idFitsCount(id, cap));
      const allowedPhysical = allowed.filter((id) => !isReplayId(id));
      const prevPhysical = prev.filter((id) => !isReplayId(id));
      const prevReplays = prev.filter((id) => isReplayId(id));
      const merged = rowsForPhysicalCount(
        mergeDroneIds(
          mergeDroneIds(prevPhysical, allowedPhysical),
          prevReplays,
        ),
        cap,
      );
      return idsChanged(prev, merged) ? merged : prev;
    });
    setVisibleIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      const cap = droneCountFromIds([...prev]);
      const liveReplays = new Set([...prev].filter((id) => isReplayId(id)));
      for (const id of poseIds) {
        if (isReplayId(id) && !liveReplays.has(id)) continue;
        if (!idFitsCount(id, cap) && cap >= 1) continue;
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
    setMapLinked(hasAnyMapAvatar(pose.drones));
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

  const handleAvatarToggle = useCallback(
    (id: string, key: AvatarKey, checked: boolean) => {
      const available = availableAvatarKeys(pose?.drones?.[id]?.avatars);
      setAvatars((prev) => ({
        ...prev,
        [id]: toggleAvatarKeys(prev[id], available, key, checked),
      }));
    },
    [pose],
  );

  const handleDroneCountChange = useCallback((n: number) => {
    setDroneIds((prev) => {
      const next = orderedDroneIds(prev, n);
      return idsChanged(prev, next) ? next : prev;
    });
    setVisibleIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (idFitsCount(id, n)) next.add(id);
      }
      for (let k = 1; k <= n; k++) {
        const id = String(k);
        if (!next.has(id)) next.add(id);
      }
      if (next.size === prev.size) {
        let same = true;
        for (const id of next) {
          if (!prev.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return next;
    });
  }, []);

  const visibleDroneIds = useMemo(
    () => filterVisible(droneIds, visibleIds),
    [droneIds, visibleIds],
  );

  const unsyncedBanner = useMemo(
    () =>
      syncMode === "manual"
        ? ""
        : pose?.drones
          ? bannerText(pose.drones)
          : "",
    [pose?.drones, syncMode],
  );

  const availableAvatars = useMemo(() => {
    const out: Record<string, AvatarKey[]> = {};
    if (!pose) return out;
    for (const [id, d] of Object.entries(pose.drones)) {
      out[id] = availableAvatarKeys(d.avatars);
    }
    return out;
  }, [pose]);

  const enabledAvatars = useMemo(() => {
    const out: Record<string, AvatarKey[]> = {};
    if (!pose) return out;
    for (const [id, d] of Object.entries(pose.drones)) {
      out[id] = enabledAvatarKeys(id, d.avatars, avatars);
    }
    return out;
  }, [pose, avatars]);

  const drones = useMemo((): DronePose[] => {
    if (!pose) return [];
    const visible = new Set(visibleDroneIds);
    const out: DronePose[] = [];
    const identity: [number, number, number, number] = [0, 0, 0, 1];

    for (const [id, d] of Object.entries(pose.drones)) {
      if (!visible.has(id) || !d.avatars) continue;
      const enabled = enabledAvatarKeys(id, d.avatars, avatars);
      if (enabled.length === 0) continue;

      const cfg = vectorConfigs[id];
      const vectorAvatar = (cfg?.avatar ?? "ekf_ned") as AvatarKey;

      enabled.forEach((key) => {
        const pos = d.avatars![key];
        if (!pos) return;
        const useTriad = avatarUsesTriad(key, d);
        const vectorBase =
          vectorAvatar === "gps" && d.avatars!.gps
            ? d.avatars!.gps
            : d.avatars!.ekf_ned ?? pos;
        const series = trajectory?.drones?.[id]?.[key];
        const trail = series ? sliceTrail(series, pose.t) : undefined;

        out.push({
          id,
          label: key,
          pos,
          attitude_q_xyzw: useTriad ? d.attitude_q_xyzw : identity,
          style: useTriad ? "triad" : "point",
          trail,
          vectors:
            useTriad &&
            key === vectorAvatar &&
            d.vectors?.velocity &&
            vectorBase
              ? {
                  velocity: d.vectors.velocity,
                  scale: cfg?.scale ?? 1,
                  base: vectorBase,
                }
              : undefined,
        });
      });
    }
    return out;
  }, [pose, trajectory, visibleDroneIds, vectorConfigs, avatars]);

  const markerPositions = useMemo(() => {
    if (!pose?.origin) return [];
    const { lat, lon, alt_m } = pose.origin;
    return markers.map((m) => ({
      id: m.id,
      label: m.label,
      ...llaToEnu(m.lat, m.lon, m.alt_m, lat, lon, alt_m),
    }));
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
      <div className="flex items-center justify-between px-4 pt-4">
        <h1 className="text-xl font-semibold">ExperimentAnalysis</h1>
        <SkinToggle />
      </div>
      <WorkspaceTabs tab={tab} onTabChange={setTab} />
      <ExperimentBar
        slug={slug}
        onSlugChange={setSlug}
        droneIds={droneIds}
        experimentName={experimentName}
        onDronesChange={handlePulled}
        onDroneCountChange={handleDroneCountChange}
        showSetup={tab === "sources"}
      />
      {tab === "sources" && (
        <div
          role="tabpanel"
          id="workspace-panel-sources"
          aria-labelledby="workspace-tab-sources"
        >
          <DroneList
            variant="sources"
            droneIds={droneIds}
            physicalCount={droneCountFromIds(droneIds)}
            visible={visibleIds}
            onToggle={handleDroneToggle}
            slug={slug}
            hosts={hosts}
            onHostCommit={handleHostCommit}
            onPulled={handlePulled}
            sshReady={sshReady}
            summaries={summaries}
          />
        </div>
      )}
      {tab === "analysis" && (
        <div
          role="tabpanel"
          id="workspace-panel-analysis"
          aria-labelledby="workspace-tab-analysis"
          className="flex min-h-0 flex-1 flex-col"
        >
          {!slug ? (
            <p className="px-4 py-8 text-sm text-zinc-400">
              Open an experiment on the Sources tab to analyze.
            </p>
          ) : (
            <>
              <DroneList
                variant="analysis"
                droneIds={droneIds}
                physicalCount={droneCountFromIds(droneIds)}
                visible={visibleIds}
                onToggle={handleDroneToggle}
                slug={slug}
                availableAvatars={availableAvatars}
                enabledAvatars={enabledAvatars}
                onAvatarToggle={handleAvatarToggle}
                syncMode={syncMode}
                mainDroneId={mainDroneId}
                offsets={syncOffsets}
                onSyncModeChange={handleSyncModeChange}
                onMainDroneChange={handleMainDroneChange}
                onOffsetChange={handleOffsetChange}
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
                <div className="flex items-start gap-4">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded border border-zinc-800">
                    <div className="flex h-[min(70vh,640px)] min-h-0 flex-col">
                      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-2 py-1">
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
                      <div className="relative z-0 min-h-0 flex-1 overflow-hidden">
                        {shouldLoadCesium(engine3d) ? (
                          <Suspense
                            fallback={
                              <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                                Loading globe…
                              </div>
                            }
                          >
                            <View3DCesium
                              drones={drones}
                              origin={pose?.origin}
                              markers={markers}
                              onGroundClick={handleGroundClick}
                              onMarkerRemove={handleMarkerRemove}
                              skin={skin}
                            />
                          </Suspense>
                        ) : (
                          <View3D
                            drones={drones}
                            origin={pose?.origin}
                            markerPositions={markerPositions}
                            onGroundClick={handleGroundClick}
                            onMarkerRemove={handleMarkerRemove}
                            skin={skin}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex h-[min(70vh,640px)] min-h-0">
                    <Map2D
                      pose={pose}
                      trajectory={trajectory}
                      uiAvatars={avatars}
                      markers={markers}
                      visibleDroneIds={visibleDroneIds}
                      open={mapLinked}
                      onOpenChange={setMapLinked}
                      skin={skin}
                    />
                  </div>
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
              <Timeline t={t} tMax={tMax} onTChange={setT} />
              <ChannelPlot
                slug={slug}
                visibleDroneIds={visibleDroneIds}
                t={t}
                tMax={tMax}
                refreshToken={refreshToken}
                skin={skin}
              />
              <PlotBoard
                slug={slug}
                t={t}
                tMax={tMax}
                refreshToken={refreshToken}
                plots={plots}
                onPlotsChange={setPlots}
                onTChange={setT}
                skin={skin}
              />
            </>
          )}
        </div>
      )}
      {slug && (tab === "replay" || keepReplaySlug === slug) ? (
        <div
          role="tabpanel"
          id="workspace-panel-replay"
          aria-labelledby="workspace-tab-replay"
          hidden={tab !== "replay"}
        >
          <ReplayTab slug={slug} manifest={manifest} onPulled={handlePulled} />
        </div>
      ) : (
        tab === "replay" && (
          <div
            role="tabpanel"
            id="workspace-panel-replay"
            aria-labelledby="workspace-tab-replay"
          >
            <p className="px-4 py-8 text-sm text-zinc-400">
              Open an experiment on the Sources tab to replay.
            </p>
          </div>
        )
      )}
    </div>
  );
}
