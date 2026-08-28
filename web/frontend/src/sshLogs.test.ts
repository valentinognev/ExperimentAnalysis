import { describe, it, expect } from "vitest";
import { sshLogLabel } from "./sshLogs";

describe("sshLogLabel", () => {
  it("formats kind, name, mtime, and size", () => {
    const label = sshLogLabel({
      kind: "sm",
      name: "20260825_system_manager_d2.csv",
      remote: "~/RL/system_manager/logs/20260825_system_manager_d2.csv",
      size: 12345,
      mtime: "2026/08/25 17:05:30",
    });
    expect(label).toContain("SM");
    expect(label).toContain("20260825_system_manager_d2.csv");
    expect(label).toContain("2026/08/25 17:05:30");
    expect(label).toContain("12345 B");
  });
});
