// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SkinProvider } from "../SkinContext";
import SkinToggle from "./SkinToggle";

describe("SkinToggle", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    delete document.documentElement.dataset.skin;
  });

  it("presses Day after clicking Day, then Night after clicking Night", async () => {
    const user = userEvent.setup();
    render(
      <SkinProvider>
        <SkinToggle />
      </SkinProvider>,
    );

    const night = screen.getByRole("button", { name: "Night" });
    const day = screen.getByRole("button", { name: "Day" });

    await user.click(day);
    expect(day).toHaveAttribute("aria-pressed", "true");
    expect(night).toHaveAttribute("aria-pressed", "false");

    await user.click(night);
    expect(night).toHaveAttribute("aria-pressed", "true");
    expect(day).toHaveAttribute("aria-pressed", "false");
  });
});
