// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listExperiments,
  createExperiment,
  openExperiment,
  importPaths,
  rebuild,
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
});
