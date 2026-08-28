import type { AvatarKey } from "./avatars";
import { AVATAR_KEYS } from "./avatars";

export type AvatarMarkerStyle = {
  /** Plotly scatter3d / Cesium billboard. */
  symbol: string;
  /** Plotly scattermap (Maki-safe). */
  mapSymbol: string;
  size: number;
  outline?: { color: string; width: number };
  halo?: boolean;
};

const STYLES: Record<AvatarKey, AvatarMarkerStyle> = {
  ekf_ned: {
    symbol: "circle",
    mapSymbol: "circle",
    size: 8,
    outline: { color: "black", width: 2 },
    halo: true,
  },
  gps: { symbol: "square", mapSymbol: "square", size: 8 },
  sm_ned: { symbol: "square-open", mapSymbol: "square-stroked", size: 8 },
  /** Maki 8 `cross` is an X, matching scatter3d `x`. */
  sm_lla: { symbol: "x", mapSymbol: "cross", size: 4 },
};

export function avatarMarkerStyle(label?: string): AvatarMarkerStyle {
  if (label && (AVATAR_KEYS as string[]).includes(label)) {
    return STYLES[label as AvatarKey];
  }
  return { symbol: "circle", mapSymbol: "circle", size: 8 };
}

export function avatarSymbolDataUri(
  symbol: string,
  fill: string,
  outline = false,
): string {
  const ring = outline ? ` stroke="black" stroke-width="2"` : "";
  let inner: string;
  if (symbol === "square") {
    inner = `<rect x="4" y="4" width="16" height="16" fill="${fill}"/>`;
  } else if (symbol === "square-open") {
    inner = `<rect x="4" y="4" width="16" height="16" fill="none" stroke="${fill}" stroke-width="2"/>`;
  } else if (symbol === "x") {
    inner = `<path d="M6 6 L18 18 M18 6 L6 18" stroke="${fill}" stroke-width="2" fill="none"/>`;
  } else {
    inner = `<circle cx="12" cy="12" r="8" fill="${fill}"${ring}/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">${inner}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
