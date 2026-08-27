// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DroneList from "./DroneList";

vi.mock("../api", () => ({
  pullDrone: vi.fn(),
  rebuild: vi.fn(),
}));

import { pullDrone, rebuild } from "../api";

describe("DroneList", () => {
  beforeEach(() => {
    vi.mocked(pullDrone).mockReset();
    vi.mocked(rebuild).mockReset();
  });

  it("rebuilds after successful pull", async () => {
    vi.mocked(pullDrone).mockResolvedValue({
      ok: true,
      drones: { "2": { ok: true } },
    });
    vi.mocked(rebuild).mockResolvedValue({ ok: true });

    const onPulled = vi.fn();
    render(
      <DroneList
        droneIds={["2"]}
        visible={new Set(["2"])}
        onToggle={() => {}}
        slug="Baseball"
        onPulled={onPulled}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "SSH" }));

    await waitFor(() => {
      expect(pullDrone).toHaveBeenCalledWith("Baseball", 2, ["ssh"]);
      expect(rebuild).toHaveBeenCalledWith("Baseball");
      expect(onPulled).toHaveBeenCalled();
    });
  });
});
