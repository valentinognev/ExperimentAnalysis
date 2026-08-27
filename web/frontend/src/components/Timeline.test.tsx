// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import Timeline, { nextDirection } from "./Timeline";

describe("nextDirection", () => {
  it("play sets direction +1", () => {
    expect(nextDirection("play")).toBe(1);
  });

  it("reverse sets direction -1", () => {
    expect(nextDirection("reverse")).toBe(-1);
  });

  it("pause sets direction 0", () => {
    expect(nextDirection("pause")).toBe(0);
  });
});

describe("Timeline", () => {
  beforeEach(() => {
    let rafId = 0;
    const pending = new Map<number, ReturnType<typeof setTimeout>>();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = ++rafId;
      const timeoutId = setTimeout(() => {
        pending.delete(id);
        cb(performance.now());
      }, 0);
      pending.set(id, timeoutId);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      const timeoutId = pending.get(id);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        pending.delete(id);
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders speed buttons 0.25, 1, 2, 4", () => {
    render(<Timeline t={0} tMax={60} onTChange={() => {}} />);
    expect(screen.getByRole("button", { name: "0.25×" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1×" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2×" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4×" })).toBeInTheDocument();
  });

  it("play then pause stops advancing T", async () => {
    const user = userEvent.setup();
    const onTChange = vi.fn();
    render(<Timeline t={5} tMax={60} onTChange={onTChange} />);

    await user.click(screen.getByRole("button", { name: "Play" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onTChange.mock.calls.length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Pause" }));
    const callsAtPause = onTChange.mock.calls.length;
    await new Promise((r) => setTimeout(r, 100));
    expect(onTChange.mock.calls.length).toBe(callsAtPause);
  });

  it("reverse decreases T while playing", async () => {
    const user = userEvent.setup();
    let t = 10;
    const onTChange = vi.fn((next: number) => {
      t = next;
    });
    const { rerender } = render(
      <Timeline t={t} tMax={60} onTChange={onTChange} />,
    );

    await user.click(screen.getByRole("button", { name: "Reverse" }));
    await new Promise((r) => setTimeout(r, 50));
    rerender(<Timeline t={t} tMax={60} onTChange={onTChange} />);
    expect(t).toBeLessThan(10);
  });
});
