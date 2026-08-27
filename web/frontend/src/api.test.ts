// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listExperiments,
  createExperiment,
  openExperiment,
  importPaths,
  rebuild,
  getPose,
  getSeries,
  patchManifest,
} from "./api";

describe("api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listExperiments parses JSON array", async () => {
    const data = [{ slug: "foo", name: "Foo", drone_ids: [], missing: [] }];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => data,
    } as Response);

    const result = await listExperiments();

    expect(fetch).toHaveBeenCalledWith("/api/experiments");
    expect(result).toEqual(data);
  });

  it("createExperiment POSTs {name}", async () => {
    const body = { slug: "foo", manifest: { name: "Foo" } };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await createExperiment("Foo");

    expect(fetch).toHaveBeenCalledWith("/api/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Foo" }),
    });
    expect(result).toEqual(body);
  });

  it("openExperiment GETs slug", async () => {
    const body = { slug: "foo", manifest: { name: "Foo" } };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await openExperiment("foo");

    expect(fetch).toHaveBeenCalledWith("/api/experiments/foo");
    expect(result).toEqual(body);
  });

  it("importPaths POSTs {paths}", async () => {
    const paths = ["/data/log.ulg"];
    const body = { imported: 1 };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await importPaths("foo", paths);

    expect(fetch).toHaveBeenCalledWith("/api/experiments/foo/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    expect(result).toEqual(body);
  });

  it("rebuild POSTs rebuild URL", async () => {
    const body = { rebuilt: true };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await rebuild("foo");

    expect(fetch).toHaveBeenCalledWith("/api/experiments/foo/rebuild", {
      method: "POST",
    });
    expect(result).toEqual(body);
  });

  it("getSeries GETs series with repeatable channels params", async () => {
    const channels = [
      "2.ulog.vehicle_local_position.x",
      "2.ulog.vehicle_local_position.y",
    ];
    const body = {
      [channels[0]]: { t: [0], y: [1] },
      [channels[1]]: { t: [0], y: [2] },
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await getSeries("foo", channels);

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain("/api/experiments/foo/series?");
    expect(url).toContain("channels=2.ulog.vehicle_local_position.x");
    expect(url).toContain("channels=2.ulog.vehicle_local_position.y");
    expect(result).toEqual(body);
  });

  it("patchManifest PATCHes manifest body", async () => {
    const patch = {
      ui: {
        plots: [{ id: "plot-1", channels: ["2.ulog.vehicle_local_position.x"] }],
      },
    };
    const body = { slug: "foo", manifest: { ui: patch.ui } };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await patchManifest("foo", patch);

    expect(fetch).toHaveBeenCalledWith("/api/experiments/foo/manifest", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    expect(result).toEqual(body);
  });

  it("getPose GETs pose?t=", async () => {
    const body = {
      t: 0,
      origin: { lat: 0, lon: 0, alt_m: 0 },
      drones: {},
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await getPose("foo", 1.5);

    expect(fetch).toHaveBeenCalledWith("/api/experiments/foo/pose?t=1.5");
    expect(result).toEqual(body);
  });
});
