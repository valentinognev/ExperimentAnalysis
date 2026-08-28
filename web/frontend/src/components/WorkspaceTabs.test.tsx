// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import WorkspaceTabs from "./WorkspaceTabs";

describe("WorkspaceTabs", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders Sources and Analysis tabs with Sources selected", () => {
    render(<WorkspaceTabs tab="sources" onTabChange={() => {}} />);

    const sources = screen.getByRole("tab", { name: "Sources" });
    const analysis = screen.getByRole("tab", { name: "Analysis" });
    expect(sources).toHaveAttribute("aria-selected", "true");
    expect(analysis).toHaveAttribute("aria-selected", "false");
  });

  it("notifies when Analysis is clicked", async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkspaceTabs tab="sources" onTabChange={onTabChange} />);

    await user.click(screen.getByRole("tab", { name: "Analysis" }));
    expect(onTabChange).toHaveBeenCalledWith("analysis");
  });
});
