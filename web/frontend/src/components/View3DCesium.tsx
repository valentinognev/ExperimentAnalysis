import { useEffect, useRef, useState } from "react";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { Cartesian2, Viewer } from "cesium";
import {
  globePickToLla,
  markerEntity,
  markerEntityId,
  markerEntityStyle,
  markerIdFromEntityId,
} from "../cesiumMarkers";
import {
  cesiumSkinAction,
  destroyCesiumViewer,
  replaceCesiumImagery,
  unbindCesiumPointerEvents,
} from "../cesiumViewer";
import { enuToLla, type Marker, type Origin } from "../markers";
import { triadSegments, type EnuPos } from "../triad";
import { avatarLegendName, type DronePose } from "./View3D";
import { droneColor } from "../droneColor";
import { avatarMarkerStyle, avatarSymbolDataUri } from "../avatarMarker";
import { cesiumImageryUrl, type Skin } from "../skin";

type View3DCesiumProps = {
  drones: DronePose[];
  scale?: number;
  origin?: Origin;
  markers?: Marker[];
  onGroundClick?: (lla: { lat: number; lon: number; alt_m: number }) => void;
  onMarkerRemove?: (id: string) => void;
  skin?: Skin;
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
    const style = markerEntityStyle();
    viewer.entities.add({
      id: markerEntityId(marker.id),
      position: Cesium.Cartesian3.fromDegrees(lon, lat, alt_m),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString(style.color),
        outlineColor: Cesium.Color.fromCssColorString(style.outlineColor),
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
    const style = avatarMarkerStyle(drone.label);
    const fill = droneColor(drone.id);
    viewer.entities.add({
      position: enuToCartesian(drone.pos, origin, Cesium),
      billboard: {
        image: avatarSymbolDataUri(
          style.symbol,
          fill,
          Boolean(style.outline),
        ),
        width: 16,
        height: 16,
      },
      label: {
        text: avatarLegendName(drone.id, drone.label),
        font: "11px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
      },
    });
    if (drone.style !== "point" && drone.attitude_q_xyzw) {
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
    }

    if (drone.trail && drone.trail.length > 1) {
      viewer.entities.add({
        polyline: {
          positions: drone.trail.map((p) => enuToCartesian(p, origin, Cesium)),
          width: 2,
          material: Cesium.Color.fromCssColorString(droneColor(drone.id)),
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
  onMarkerRemove,
  skin = "night",
}: View3DCesiumProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const framedOriginRef = useRef<string | null>(null);
  const skinRef = useRef(skin);
  const appliedSkinRef = useRef<Skin | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  skinRef.current = skin;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    setLoadError(null);
    setViewerReady(false);

    import("cesium")
      .then((Cesium) => {
        if (cancelled) return;

        cesiumRef.current = Cesium;
        const initialSkin = skinRef.current;
        const viewer = new Cesium.Viewer(container, {
          baseLayer: new Cesium.ImageryLayer(
            new Cesium.UrlTemplateImageryProvider({
              url: cesiumImageryUrl(initialSkin),
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
        appliedSkinRef.current = initialSkin;
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
      framedOriginRef.current = null;
      appliedSkinRef.current = null;
      destroyCesiumViewer(viewerRef.current);
      viewerRef.current = null;
      cesiumRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewerReady || !viewer || !Cesium) return;
    if (cesiumSkinAction(appliedSkinRef.current, skin) !== "replace-imagery") {
      return;
    }
    replaceCesiumImagery(
      viewer,
      new Cesium.UrlTemplateImageryProvider({
        url: cesiumImageryUrl(skin),
      }),
    );
    appliedSkinRef.current = skin;
  }, [skin, viewerReady]);

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
    if (!viewerReady || !viewer || !Cesium || !origin) return;
    if (!onGroundClick && !onMarkerRemove) return;

    const handler = viewer.screenSpaceEventHandler;
    const preventMenu = (e: Event) => e.preventDefault();
    viewer.scene.canvas.addEventListener("contextmenu", preventMenu);

    const pickedMarkerId = (position: Cartesian2): string | null => {
      const picked = viewer.scene.pick(position) as { id?: { id?: string } } | undefined;
      if (!Cesium.defined(picked) || picked?.id?.id == null) return null;
      return markerIdFromEntityId(String(picked.id.id));
    };

    handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    handler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);

    if (onGroundClick) {
      handler.setInputAction((click: { position: Cartesian2 }) => {
        if (pickedMarkerId(click.position)) return;
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
      }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    }

    if (onMarkerRemove) {
      handler.setInputAction((click: { position: Cartesian2 }) => {
        const id = pickedMarkerId(click.position);
        if (id) onMarkerRemove(id);
      }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    }

    return () => {
      unbindCesiumPointerEvents(
        viewer,
        handler,
        Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
        Cesium.ScreenSpaceEventType.RIGHT_CLICK,
        preventMenu,
      );
    };
  }, [viewerReady, origin, onGroundClick, onMarkerRemove]);

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
