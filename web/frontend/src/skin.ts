export type Skin = "night" | "day";

export const SKIN_STORAGE_KEY = "ea-skin";

export type PlotTheme = {
  paper_bgcolor: string;
  plot_bgcolor: string;
  font_color: string;
  gridcolor: string;
  cursor_color: string;
  scene_bgcolor: string;
  axis_color: string;
  legend_bgcolor: string;
  legend_font_color: string;
};

const NIGHT_THEME: PlotTheme = {
  paper_bgcolor: "#09090b",
  plot_bgcolor: "#18181b",
  font_color: "#e4e4e7",
  gridcolor: "#3f3f46",
  cursor_color: "#fafafa",
  scene_bgcolor: "#18181b",
  axis_color: "#e4e4e7",
  legend_bgcolor: "rgba(9,9,11,0.7)",
  legend_font_color: "#e4e4e7",
};

const DAY_THEME: PlotTheme = {
  paper_bgcolor: "#fafafa",
  plot_bgcolor: "#ffffff",
  font_color: "#18181b",
  gridcolor: "#d4d4d8",
  cursor_color: "#18181b",
  scene_bgcolor: "#ffffff",
  axis_color: "#3f3f46",
  legend_bgcolor: "rgba(250,250,250,0.85)",
  legend_font_color: "#18181b",
};

export function parseSkin(raw: unknown): Skin {
  return raw === "day" ? "day" : "night";
}

export function loadSkin(): Skin {
  try {
    return parseSkin(localStorage.getItem(SKIN_STORAGE_KEY));
  } catch {
    return "night";
  }
}

export function saveSkin(skin: Skin): void {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
  } catch {
    // Quota / disabled storage must not break the UI.
  }
}

export function plotTheme(skin: Skin): PlotTheme {
  return skin === "day" ? DAY_THEME : NIGHT_THEME;
}

export function mapTileStyle(skin: Skin): "open-street-map" | "carto-darkmatter" {
  return skin === "day" ? "open-street-map" : "carto-darkmatter";
}

export function cesiumImageryUrl(skin: Skin): string {
  return skin === "day"
    ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    : "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
}
