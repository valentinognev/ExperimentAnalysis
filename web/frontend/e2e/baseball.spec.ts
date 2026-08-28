import { test, expect, type Page } from "@playwright/test";

const BASEBALL = "/home/valentin/RL/TESTFLIGHTS/Baseball";

async function setDroneCount(page: Page, n: string) {
  await page.getByRole("combobox", { name: "Drone #" }).selectOption(n);
  const count = Number(n);
  for (let id = 1; id <= count; id++) {
    await expect(
      page.getByRole("listitem").filter({ hasText: `D${id}` }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Update" }).click();
}

async function importBaseballOnRow(page: Page, id: string) {
  const row = page.getByRole("listitem").filter({ hasText: `D${id}` });
  await row.getByRole("button", { name: "Import" }).click();
  const dialog = page.getByRole("dialog", { name: "Import files" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("path to .ulg or logs dir").fill(BASEBALL);
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(dialog).toBeHidden({ timeout: 240_000 });
}

test("Baseball reconstruction in the UI", async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /ExperimentAnalysis/i })).toBeVisible();
  await page.getByLabel(/name/i).fill("BaseballE2E");
  await page.getByRole("button", { name: /new/i }).click();
  await expect(page.getByRole("tab", { name: "Sources" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("Experiment")).not.toHaveValue("");

  await setDroneCount(page, "4");

  for (const id of ["2", "3", "4"]) {
    await importBaseballOnRow(page, id);
    await expect(page.getByRole("tab", { name: "Sources" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  }

  const d2 = page.getByLabel("D2 sources");
  await expect(d2).toContainText("Group3RLcat2_log_41_2026-8-25-17-05-30.ulg");
  await expect(d2).toContainText("2026-08-25");
  await expect(d2).toContainText("17:05:30");

  await page.getByRole("tab", { name: "Analysis" }).click();
  await expect(page.getByRole("tab", { name: "Analysis" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("checkbox", { name: "D1" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "D2" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "D3" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "D4" })).toBeVisible();
  await expect(page.locator(".js-plotly-plot").first()).toBeVisible();
  await expect(page.getByRole("slider")).toBeVisible();
});
