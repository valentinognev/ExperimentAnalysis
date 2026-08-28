import { describe, it, expect } from "vitest";
import { mavlinkLogLabel } from "./mavlinkLogs";

describe("mavlinkLogLabel", () => {
  it("formats id, utc time, and size", () => {
    expect(mavlinkLogLabel({ id: 2, time_utc: 1, size: 128 })).toContain("#2");
    expect(mavlinkLogLabel({ id: 2, time_utc: 1, size: 128 })).toContain("128 B");
    expect(mavlinkLogLabel({ id: 2, time_utc: 0, size: 10 })).toContain("unknown time");
  });
});
