import {
  MARKER_COLOR,
  MARKER_OUTLINE_COLOR,
  type Marker,
  type Origin,
} from "./markers";

const MARKER_ENTITY_PREFIX = "ea-marker-";

export function markerEntityId(id: string): string {
  return `${MARKER_ENTITY_PREFIX}${id}`;
}

export function markerIdFromEntityId(entityId: string): string | null {
  if (!entityId.startsWith(MARKER_ENTITY_PREFIX)) return null;
  return entityId.slice(MARKER_ENTITY_PREFIX.length);
}

/** Lon/lat/alt for Cesium `Cartesian3.fromDegrees(lon, lat, alt_m)`. */
export function markerEntity(m: Marker): {
  lon: number;
  lat: number;
  alt_m: number;
} {
  return { lon: m.lon, lat: m.lat, alt_m: m.alt_m };
}

/** CSS colors for Cesium point fill/outline (shared with Plotly). */
export function markerEntityStyle(): {
  color: string;
  outlineColor: string;
} {
  return { color: MARKER_COLOR, outlineColor: MARKER_OUTLINE_COLOR };
}

/** Globe pick lat/lon with experiment ground altitude (Plotly u=0). */
export function globePickToLla(
  lat: number,
  lon: number,
  origin: Origin,
): { lat: number; lon: number; alt_m: number } {
  return { lat, lon, alt_m: origin.alt_m };
}
