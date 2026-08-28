import { test, expect, type Page } from "@playwright/test";

const BASEBALL = "/home/valentin/RL/TESTFLIGHTS/Baseball";

async function addDrone(page: Page, id: string) {
  await page.getByLabel("Drone #").fill(id);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: `D${id}` }),
  ).toBeVisible();
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

  await addDrone(page, "2");
  await addDrone(page, "3");
  await addDrone(page, "4");

  for (const id of ["2", "3", "4"]) {
    await importBaseballOnRow(page, id);
    await expect(page.getByRole("tab", { name: "Sources" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  }

  await page.getByRole("tab", { name: "Analysis" }).click();
  await expect(page.getByRole("tab", { name: "Analysis" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("checkbox", { name: "D2" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "D3" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "D4" })).toBeVisible();
  await expect(page.locator(".js-plotly-plot").first()).toBeVisible();
  await expect(page.getByRole("slider")).toBeVisible();
});
