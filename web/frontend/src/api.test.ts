// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listExperiments,
  createExperiment,
  openExperiment,
  importPaths,
  pullDrone,
  listSshLogs,
  copySshLogs,
  listMavlinkLogs,
  downloadMavlinkLog,
  rebuild,
  browseFolder,
  getPose,
  getSeries,
  getDuration,
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

  it("importPaths POSTs {paths, assignments} when provided", async () => {
    const paths = ["/data/mystery.ulg"];
    const assignments = { "mystery.ulg": 3 };
    const body = { ok: true, needs_id: [] };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await importPaths("foo", paths, assignments);

    expect(fetch).toHaveBeenCalledWith("/api/experiments/foo/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths, assignments }),
    });
    expect(result).toEqual(body);
  });

  it("pullDrone POSTs {drone_id, adapters}", async () => {
    const body = { ok: true, drones: { "2": { ok: true } } };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await pullDrone("foo", 2, ["ssh", "mavlink"]);

    expect(fetch).toHaveBeenCalledWith("/api/experiments/foo/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drone_id: 2, adapters: ["ssh", "mavlink"] }),
    });
    expect(result).toEqual(body);
  });

  it("listSshLogs POSTs drone_id", async () => {
    const body = {
      ok: true,
      logs: [
        {
          kind: "sm",
          name: "a.csv",
          remote: "~/RL/system_manager/logs/a.csv",
          size: 1,
          mtime: "2026/08/25 17:05:30",
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await listSshLogs("foo", 2);

    expect(fetch).toHaveBeenCalledWith("/api/experiments/foo/ssh/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drone_id: 2 }),
    });
    expect(result).toEqual(body);
  });

  it("copySshLogs POSTs selected files", async () => {
    const body = { ok: true };
    const files = [
      {
        remote: "~/RL/system_manager/logs/a.csv",
        name: "a.csv",
      },
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await copySshLogs("foo", 2, files);

    expect(fetch).toHaveBeenCalledWith("/api/experiments/foo/ssh/copy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ drone_id: 2, files }),
    });
    expect(result).toEqual(body);
  });

  it("copySshLogs applies SSE data: lines to onProgress before done", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"event":"progress","name":"a.csv","index":1,"count":1,"bytes":4,"total":10,"pct":40}\n\n' +
              'data: {"event":"done","ok":true}\n\n',
          ),
        );
        controller.close();
      },
    });
    const onProgress = vi.fn();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: {
        get: (key: string) =>
          key.toLowerCase() === "content-type" ? "text/event-stream" : null,
      },
      body,
    } as Response);

    const result = await copySshLogs(
      "foo",
      2,
      [{ remote: "~/RL/system_manager/logs/a.csv", name: "a.csv" }],
      { onProgress },
    );

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ event: "progress", name: "a.csv", pct: 40 }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("listMavlinkLogs POSTs transport and optional serial", async () => {
    const body = { ok: true, logs: [{ id: 1, time_utc: 0, size: 10 }] };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await listMavlinkLogs("foo", 2, "serial", "/dev/ttyUSB0");

    expect(fetch).toHaveBeenCalledWith("/api/experiments/foo/mavlink/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        drone_id: 2,
        transport: "serial",
        serial: "/dev/ttyUSB0",
      }),
    });
    expect(result).toEqual(body);
  });

  it("downloadMavlinkLog POSTs log_id and confirm_replace", async () => {
    const body = { ok: true };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await downloadMavlinkLog("foo", 2, 7, "tcp", true);

    expect(fetch).toHaveBeenCalledWith("/api/experiments/foo/mavlink/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        drone_id: 2,
        log_id: 7,
        transport: "tcp",
        confirm_replace: true,
      }),
    });
    expect(result).toEqual(body);
  });

  it("browseFolder POSTs /api/browse-folder and parses {path}", async () => {
    const body = { path: "/tmp/sitl" };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);

    const result = await browseFolder();

    expect(fetch).toHaveBeenCalledWith("/api/browse-folder", {
      method: "POST",
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

  it("throws when response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "experiment not found",
    } as Response);

    await expect(openExperiment("nope")).rejects.toThrow("experiment not found");
  });

  it("getDuration GETs duration URL", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ t_max_s: 155 }),
    } as Response);

    const result = await getDuration("Baseball");

    expect(fetch).toHaveBeenCalledWith("/api/experiments/Baseball/duration");
    expect(result).toEqual({ t_max_s: 155 });
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
