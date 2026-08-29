// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  SKIN_STORAGE_KEY,
  cesiumImageryUrl,
  loadSkin,
  mapTileStyle,
  parseSkin,
  plotTheme,
  saveSkin,
} from "./skin";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

function throwingStorage(method: "getItem" | "setItem"): Storage {
  const inner = memoryStorage();
  return {
    get length() {
      return inner.length;
    },
    clear() {
      inner.clear();
    },
    getItem(key: string) {
      if (method === "getItem") throw new Error("storage disabled");
      return inner.getItem(key);
    },
    key(index: number) {
      return inner.key(index);
    },
    removeItem(key: string) {
      inner.removeItem(key);
    },
    setItem(key: string, value: string) {
      if (method === "setItem") throw new Error("quota exceeded");
      inner.setItem(key, value);
    },
  };
}

function installStorage(storage: Storage): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    enumerable: true,
    value: storage,
    writable: true,
  });
}

describe("parseSkin", () => {
  it('maps "day" to day', () => {
    expect(parseSkin("day")).toBe("day");
  });

  it("maps everything else to night", () => {
    expect(parseSkin("night")).toBe("night");
    expect(parseSkin("")).toBe("night");
    expect(parseSkin(null)).toBe("night");
    expect(parseSkin("dark")).toBe("night");
    expect(parseSkin(1)).toBe("night");
  });
});

describe("loadSkin", () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("returns night when the key is missing", () => {
    installStorage(memoryStorage());
    expect(loadSkin()).toBe("night");
  });

  it('returns day when "day" is stored', () => {
    const storage = memoryStorage();
    storage.setItem(SKIN_STORAGE_KEY, "day");
    installStorage(storage);
    expect(loadSkin()).toBe("day");
  });

  it("returns night when getItem throws", () => {
    installStorage(throwingStorage("getItem"));
    expect(loadSkin()).toBe("night");
  });
});

describe("saveSkin", () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('writes "day" and "night" under ea-skin', () => {
    const storage = memoryStorage();
    installStorage(storage);
    expect(SKIN_STORAGE_KEY).toBe("ea-skin");

    saveSkin("day");
    expect(storage.getItem(SKIN_STORAGE_KEY)).toBe("day");

    saveSkin("night");
    expect(storage.getItem(SKIN_STORAGE_KEY)).toBe("night");
  });

  it("does not throw when setItem throws", () => {
    installStorage(throwingStorage("setItem"));
    expect(() => saveSkin("day")).not.toThrow();
  });
});

describe("plotTheme", () => {
  it("returns night tokens", () => {
    expect(plotTheme("night")).toEqual({
      paper_bgcolor: "#09090b",
      plot_bgcolor: "#18181b",
      font_color: "#e4e4e7",
      gridcolor: "#3f3f46",
      cursor_color: "#fafafa",
      scene_bgcolor: "#18181b",
      axis_color: "#e4e4e7",
      legend_bgcolor: "rgba(9,9,11,0.7)",
      legend_font_color: "#e4e4e7",
    });
  });

  it("returns day tokens", () => {
    expect(plotTheme("day")).toEqual({
      paper_bgcolor: "#fafafa",
      plot_bgcolor: "#ffffff",
      font_color: "#18181b",
      gridcolor: "#d4d4d8",
      cursor_color: "#18181b",
      scene_bgcolor: "#ffffff",
      axis_color: "#3f3f46",
      legend_bgcolor: "rgba(250,250,250,0.85)",
      legend_font_color: "#18181b",
    });
  });
});

describe("mapTileStyle", () => {
  it("maps night to carto-darkmatter and day to open-street-map", () => {
    expect(mapTileStyle("night")).toBe("carto-darkmatter");
    expect(mapTileStyle("day")).toBe("open-street-map");
  });
});

describe("cesiumImageryUrl", () => {
  it("maps night and day to the constrained tile URLs", () => {
    expect(cesiumImageryUrl("night")).toBe(
      "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    );
    expect(cesiumImageryUrl("day")).toBe(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    );
  });
});
