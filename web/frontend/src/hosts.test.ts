// @vitest-environment node
import { describe, it, expect } from "vitest";
import { hostPatch, hostsFromManifest } from "./hosts";

describe("hostsFromManifest", () => {
  it("reads ssh.host keyed by drone id", () => {
    expect(
      hostsFromManifest([
        { id: 2, ssh: { user: "pi", host: "192.168.31.30" } },
        { id: 3, ssh: { user: "pi", host: "" } },
        { id: 4, ssh: { user: "pi", host: "192.168.31.152" } },
      ]),
    ).toEqual({
      "2": "192.168.31.30",
      "3": "",
      "4": "192.168.31.152",
    });
  });

  it("returns empty for missing drones", () => {
    expect(hostsFromManifest(undefined)).toEqual({});
    expect(hostsFromManifest([])).toEqual({});
  });
});

describe("hostPatch", () => {
  it("PATCHes ssh.host and mavlink url when host is set", () => {
    expect(hostPatch("2", " 10.0.0.1 ")).toEqual({
      drones: [
        {
          id: 2,
          ssh: { host: "10.0.0.1" },
          mavlink: { url: "tcp:10.0.0.1:5760" },
        },
      ],
    });
  });

  it("PATCHes empty host without inventing mavlink url", () => {
    expect(hostPatch("3", "")).toEqual({
      drones: [{ id: 3, ssh: { host: "" } }],
    });
  });
});
