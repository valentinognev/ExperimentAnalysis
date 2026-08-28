// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseLogStamp, preselectKeys, rankByUlg, stampMs } from "./logStamp";

describe("parseLogStamp", () => {
  it("reads a dashed system_manager filename", () => {
    const ms = parseLogStamp("2026-08-24_21-12-03_system_manager.csv");
    expect(ms).toBe(stampMs("2026-08-24", "21:12:03"));
  });

  it("reads a compact YYYYMMDD prefix as midnight that day", () => {
    const ms = parseLogStamp("20260825_system_manager_d2.csv");
    expect(ms).toBe(stampMs("2026-08-25", "00:00:00"));
  });

  it("reads a PX4 ulog stamp", () => {
    expect(parseLogStamp("Group3RLcat2_log_41_2026-8-25-17-05-30.ulg")).toBe(
      stampMs("2026-08-25", "17:05:30"),
    );
  });

  it("returns null when there is no stamp", () => {
    expect(parseLogStamp("system_manager.csv")).toBeNull();
    expect(parseLogStamp("adapter_diag.log")).toBeNull();
  });
});

describe("stampMs", () => {
  it("returns null for missing summary stamps", () => {
    expect(stampMs("—", "—")).toBeNull();
    expect(stampMs("", "17:05:30")).toBeNull();
  });
});

describe("rankByUlg", () => {
  const logs = [
    { name: "2026-07-19_22-33-25_system_manager.csv", key: "old" },
    { name: "2026-08-24_21-12-03_system_manager.csv", key: "near" },
    { name: "2026-08-25_17-00-00_system_manager.csv", key: "closest" },
  ];

  it("orders closest to the ulg stamp first", () => {
    const ulg = stampMs("2026-08-25", "17:05:30")!;
    expect(rankByUlg(logs, ulg).map((l) => l.key)).toEqual(["closest", "near", "old"]);
  });

  it("keeps original order when the ulg has no stamp", () => {
    expect(rankByUlg(logs, null).map((l) => l.key)).toEqual(["old", "near", "closest"]);
  });
});

describe("preselectKeys", () => {
  const logs = [
    { kind: "sm" as const, name: "2026-07-19_22-33-25_system_manager.csv", key: "sm-old" },
    { kind: "sm" as const, name: "2026-08-25_17-00-00_system_manager.csv", key: "sm-near" },
    { kind: "ha" as const, name: "2026-07-19_22-40-00_adapter_diag.log", key: "ha-old" },
    { kind: "ha" as const, name: "2026-08-25_17-06-00_adapter_diag.log", key: "ha-near" },
  ];

  it("preselects the closest SM and HA within 24 hours", () => {
    const ulg = stampMs("2026-08-25", "17:05:30")!;
    expect(preselectKeys(logs, ulg)).toEqual(["sm-near", "ha-near"]);
  });

  it("selects nothing when the closest file is outside the window", () => {
    const ulg = stampMs("2026-08-25", "17:05:30")!;
    const far = [
      { kind: "sm" as const, name: "2026-07-19_22-33-25_system_manager.csv", key: "sm-old" },
    ];
    expect(preselectKeys(far, ulg)).toEqual([]);
  });

  it("selects nothing without an ulg stamp", () => {
    expect(preselectKeys(logs, null)).toEqual([]);
  });
});
