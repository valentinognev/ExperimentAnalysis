// @vitest-environment node
import { describe, it, expect } from "vitest";
import config from "../vite.config";

describe("vite ports", () => {
  it("uses 6473 and proxies api to 6400", () => {
    const c = typeof config === "function" ? config({ command: "serve", mode: "test" }) : config;
    expect(c.server.port).toBe(6473);
    expect(c.server.host).toBe("127.0.0.1");
    expect(c.server.proxy["/api"].target).toBe("http://127.0.0.1:6400");
  });
});
