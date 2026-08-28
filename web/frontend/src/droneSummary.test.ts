// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  basename,
  parseUlgStamp,
  summariesFromManifest,
} from "./droneSummary";

describe("basename", () => {
  it("keeps the last path segment", () => {
    expect(basename("raw/drone_2/Group3RLcat2_log_41_2026-8-25-17-05-30.ulg")).toBe(
      "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg",
    );
    expect(basename("sm.csv")).toBe("sm.csv");
    expect(basename("")).toBe("");
  });
});

describe("parseUlgStamp", () => {
  it("reads PX4 ulog date and time with unpadded month/day", () => {
    expect(
      parseUlgStamp("Group3RLcat2_log_41_2026-8-25-17-05-30.ulg"),
    ).toEqual({ date: "2026-08-25", time: "17:05:30" });
  });

  it("returns null when the name has no stamp", () => {
    expect(parseUlgStamp("Group3RLcat2_log_1.ulg")).toBeNull();
    expect(parseUlgStamp("notes.txt")).toBeNull();
  });
});

describe("summariesFromManifest", () => {
  it("fills ulg, stamp, SM, and HA from sources paths", () => {
    expect(
      summariesFromManifest([
        {
          id: 2,
          sources: {
            ulg: ["raw/drone_2/Group3RLcat2_log_41_2026-8-25-17-05-30.ulg"],
            system_manager: ["raw/drone_2/20260825_system_manager_d2.csv"],
            hardware_adapter: ["raw/drone_2/adapter_diag_d2.log"],
          },
        },
      ]),
    ).toEqual({
      "2": {
        ulg: "Group3RLcat2_log_41_2026-8-25-17-05-30.ulg",
        date: "2026-08-25",
        time: "17:05:30",
        sm: ["20260825_system_manager_d2.csv"],
        ha: ["adapter_diag_d2.log"],
      },
    });
  });

  it("uses em dashes and empty lists when a drone has no files", () => {
    expect(
      summariesFromManifest([{ id: 1, sources: { ulg: [], system_manager: [], hardware_adapter: [] } }]),
    ).toEqual({
      "1": { ulg: "—", date: "—", time: "—", sm: [], ha: [] },
    });
  });

  it("uses the last ulg when several are listed", () => {
    const s = summariesFromManifest([
      {
        id: 2,
        sources: {
          ulg: ["raw/drone_2/old.ulg", "raw/drone_2/Group3RLcat2_log_41_2026-8-25-17-05-30.ulg"],
        },
      },
    ]);
    expect(s["2"].ulg).toBe("Group3RLcat2_log_41_2026-8-25-17-05-30.ulg");
    expect(s["2"].date).toBe("2026-08-25");
  });

  it("returns empty for missing drones", () => {
    expect(summariesFromManifest(undefined)).toEqual({});
    expect(summariesFromManifest([])).toEqual({});
  });
});
