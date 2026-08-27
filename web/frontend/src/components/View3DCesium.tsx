import { useEffect, useRef, useState } from "react";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { Viewer } from "cesium";
import { enuToLla, type Origin } from "../markers";
import { triadSegments, type EnuPos } from "../triad";
import type { DronePose } from "./View3D";

type View3DCesiumProps = {
  drones: DronePose[];
  scale?: number;
  origin?: Origin;
};

type CesiumModule = typeof import("cesium");

function enuToCartesian(
  enu: EnuPos,
  origin: Origin,
  Cesium: CesiumModule,
): import("cesium").Cartesian3 {
  const lla = enuToLla(enu.e, enu.n, enu.u, origin.lat, origin.lon, origin.alt_m);
  return Cesium.Cartesian3.fromDegrees(lla.lon, lla.lat, lla.alt_m);
}

function updateEntities(
  viewer: Viewer,
  Cesium: CesiumModule,
  drones: DronePose[],
  origin: Origin,
  scale: number,
) {
  viewer.entities.removeAll();

  for (const drone of drones) {
    for (const segment of triadSegments(
      drone.pos,
      drone.attitude_q_xyzw,
      scale,
    )) {
      viewer.entities.add({
        polyline: {
          positions: [
            enuToCartesian(segment.start, origin, Cesium),
            enuToCartesian(segment.end, origin, Cesium),
          ],
          width: 4,
          material: Cesium.Color.fromCssColorString(segment.color),
        },
      });
    }

    if (drone.trail && drone.trail.length > 1) {
      viewer.entities.add({
        polyline: {
          positions: drone.trail.map((p) => enuToCartesian(p, origin, Cesium)),
          width: 2,
          material: Cesium.Color.ORANGE,
        },
      });
    }

    if (drone.vectors?.velocity) {
      const base = drone.vectors.base;
      const tip: EnuPos = {
        e: base.e + drone.vectors.velocity.e * drone.vectors.scale,
        n: base.n + drone.vectors.velocity.n * drone.vectors.scale,
        u: base.u + drone.vectors.velocity.u * drone.vectors.scale,
      };
      viewer.entities.add({
        polyline: {
          positions: [
            enuToCartesian(base, origin, Cesium),
            enuToCartesian(tip, origin, Cesium),
          ],
          width: 3,
          material: Cesium.Color.CYAN,
        },
      });
    }
  }
}

export default function View3DCesium({
  drones,
  scale = 1,
  origin,
}: View3DCesiumProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    import("cesium").then((Cesium) => {
      if (cancelled) return;

      cesiumRef.current = Cesium;
      const viewer = new Cesium.Viewer(container, {
        baseLayer: new Cesium.ImageryLayer(
          new Cesium.UrlTemplateImageryProvider({
            url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          }),
        ),
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        creditContainer: document.createElement("div"),
      });
      viewerRef.current = viewer;
      setViewerReady(true);
    });

    return () => {
      cancelled = true;
      setViewerReady(false);
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      cesiumRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewerReady || !viewer || !Cesium || !origin) return;
    updateEntities(viewer, Cesium, drones, origin, scale);
  }, [viewerReady, drones, origin, scale]);

  return (
    <div
      ref={containerRef}
      className="h-[calc(100%-2rem)] w-full [&_.cesium-viewer]:h-full [&_.cesium-viewer]:w-full"
    />
  );
}
