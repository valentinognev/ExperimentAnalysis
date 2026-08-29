// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SKIN_STORAGE_KEY } from "./skin";
import { SkinProvider, useSkin } from "./SkinContext";

function Probe() {
  const { setSkin } = useSkin();
  return (
    <button type="button" onClick={() => setSkin("day")}>
      to-day
    </button>
  );
}

describe("SkinProvider", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    delete document.documentElement.dataset.skin;
    vi.restoreAllMocks();
  });

  it('setSkin("day") persists the skin in localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    render(
      <SkinProvider>
        <Probe />
      </SkinProvider>,
    );

    await user.click(screen.getByRole("button", { name: "to-day" }));

    expect(setItem).toHaveBeenCalledWith(SKIN_STORAGE_KEY, "day");
    expect(localStorage.getItem(SKIN_STORAGE_KEY)).toBe("day");
  });
});
