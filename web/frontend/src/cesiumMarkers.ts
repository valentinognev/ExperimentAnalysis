import type { Marker, Origin } from "./markers";

/** Lon/lat/alt for Cesium `Cartesian3.fromDegrees(lon, lat, alt_m)`. */
export function markerEntity(m: Marker): {
  lon: number;
  lat: number;
  alt_m: number;
} {
  return { lon: m.lon, lat: m.lat, alt_m: m.alt_m };
}

/** Globe pick lat/lon with experiment ground altitude (Plotly u=0). */
export function globePickToLla(
  lat: number,
  lon: number,
  origin: Origin,
): { lat: number; lon: number; alt_m: number } {
  return { lat, lon, alt_m: origin.alt_m };
}
