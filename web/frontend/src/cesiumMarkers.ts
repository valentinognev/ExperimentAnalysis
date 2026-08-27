import type { Marker } from "./markers";

/** Lon/lat/alt for Cesium `Cartesian3.fromDegrees(lon, lat, alt_m)`. */
export function markerEntity(m: Marker): {
  lon: number;
  lat: number;
  alt_m: number;
} {
  return { lon: m.lon, lat: m.lat, alt_m: m.alt_m };
}
