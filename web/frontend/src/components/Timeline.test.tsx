// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { PLOT_TIME_MARGIN } from "../channelPlotAxis";
import Timeline, { nextDirection, transportButtons } from "./Timeline";

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

describe("transportButtons", () => {
  it("idle is Play then Reverse, both enabled", () => {
    expect(transportButtons(0)).toEqual([
      { action: "play", label: "Play", disabled: false },
      { action: "reverse", label: "Reverse", disabled: false },
    ]);
  });

  it("playing replaces Play with Pause and disables Reverse", () => {
    expect(transportButtons(1)).toEqual([
      { action: "pause", label: "Pause", disabled: false },
      { action: "reverse", label: "Reverse", disabled: true },
    ]);
  });

  it("reversing replaces Reverse with Pause and disables Play", () => {
    expect(transportButtons(-1)).toEqual([
      { action: "play", label: "Play", disabled: true },
      { action: "pause", label: "Pause", disabled: false },
    ]);
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

  it("idle has no Pause; Play toggles to Pause and disables Reverse", async () => {
    const user = userEvent.setup();
    render(<Timeline t={5} tMax={60} onTChange={() => {}} />);

    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Play" }));

    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reverse" })).toBeDisabled();
  });

  it("Reverse toggles to Pause and disables Play", async () => {
    const user = userEvent.setup();
    render(<Timeline t={5} tMax={60} onTChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Reverse" }));

    expect(screen.queryByRole("button", { name: "Reverse" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it("insets the scrubber track to the plot time-axis margins", () => {
    render(<Timeline t={0} tMax={60} onTChange={() => {}} />);
    const track = screen.getByTestId("time-scrubber-track");
    expect(track).toHaveStyle({
      paddingLeft: `${PLOT_TIME_MARGIN.l}px`,
      paddingRight: `${PLOT_TIME_MARGIN.r}px`,
    });
  });

  it("places the thumb at t/tMax of the track", () => {
    render(<Timeline t={80} tMax={160} onTChange={() => {}} />);
    expect(screen.getByTestId("time-scrubber-thumb")).toHaveStyle({ left: "50%" });
  });

  it("puts the scrubber on its own row below Play", () => {
    render(<Timeline t={0} tMax={60} onTChange={() => {}} />);
    const play = screen.getByRole("button", { name: "Play" });
    const slider = screen.getByRole("slider", { name: "Time scrubber" });
    expect(
      play.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
