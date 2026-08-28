// @vitest-environment node
import { describe, it, expect } from "vitest";
import { sshReadyFromManifest } from "./sshReady";

describe("sshReadyFromManifest", () => {
  it("is true when SM or HA sources exist", () => {
    expect(
      sshReadyFromManifest([
        {
          id: 2,
          sources: { system_manager: ["raw/drone_2/sm.csv"], hardware_adapter: [] },
        },
        { id: 3, sources: { system_manager: [], hardware_adapter: [] } },
        {
          id: 4,
          sources: { system_manager: [], hardware_adapter: ["raw/drone_4/ha.log"] },
        },
      ]),
    ).toEqual({ "2": true, "3": false, "4": true });
  });

  it("ulog-only is not SSH-ready", () => {
    expect(
      sshReadyFromManifest([
        { id: 2, sources: { ulg: ["raw/drone_2/a.ulg"], system_manager: [] } },
      ]),
    ).toEqual({ "2": false });
  });

  it("returns empty for missing drones", () => {
    expect(sshReadyFromManifest(undefined)).toEqual({});
    expect(sshReadyFromManifest([])).toEqual({});
  });
});
