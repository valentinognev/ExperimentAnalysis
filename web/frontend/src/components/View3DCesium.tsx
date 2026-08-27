import { useEffect, useRef, useState } from "react";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { Viewer } from "cesium";
import { globePickToLla, markerEntity } from "../cesiumMarkers";
import { enuToLla, type Marker, type Origin } from "../markers";
import { triadSegments, type EnuPos } from "../triad";
import type { DronePose } from "./View3D";

type View3DCesiumProps = {
  drones: DronePose[];
  scale?: number;
  origin?: Origin;
  markers?: Marker[];
  onGroundClick?: (lla: { lat: number; lon: number; alt_m: number }) => void;
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

function frameOrigin(
  viewer: Viewer,
  Cesium: CesiumModule,
  origin: Origin,
) {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      origin.lon,
      origin.lat,
      origin.alt_m + 500,
    ),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-45),
      roll: 0,
    },
  });
}

function updateEntities(
  viewer: Viewer,
  Cesium: CesiumModule,
  drones: DronePose[],
  markers: Marker[],
  origin: Origin,
  scale: number,
) {
  viewer.entities.removeAll();

  for (const marker of markers) {
    const { lon, lat, alt_m } = markerEntity(marker);
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, alt_m),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString("#facc15"),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
      },
      label: {
        text: marker.label,
        font: "12px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
      },
    });
  }

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
  markers = [],
  onGroundClick,
}: View3DCesiumProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const framedOriginRef = useRef<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    setLoadError(null);

    import("cesium")
      .then((Cesium) => {
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
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load Cesium globe",
        );
      });

    return () => {
      cancelled = true;
      setViewerReady(false);
      framedOriginRef.current = null;
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

    updateEntities(viewer, Cesium, drones, markers, origin, scale);

    const originKey = `${origin.lat},${origin.lon},${origin.alt_m}`;
    if (framedOriginRef.current !== originKey) {
      frameOrigin(viewer, Cesium, origin);
      framedOriginRef.current = originKey;
    }
  }, [viewerReady, drones, markers, origin, scale]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewerReady || !viewer || !Cesium || !origin || !onGroundClick) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const ray = viewer.camera.getPickRay(click.position);
      const cartesian =
        ray
          ? viewer.scene.globe.pick(ray, viewer.scene)
          : viewer.camera.pickEllipsoid(
              click.position,
              viewer.scene.globe.ellipsoid,
            );
      if (!cartesian) return;

      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      onGroundClick(
        globePickToLla(
          Cesium.Math.toDegrees(cartographic.latitude),
          Cesium.Math.toDegrees(cartographic.longitude),
          origin,
        ),
      );
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [viewerReady, origin, onGroundClick]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-red-400">
        {loadError}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full min-h-0 [&_.cesium-viewer]:h-full [&_.cesium-viewer]:w-full"
    />
  );
}
