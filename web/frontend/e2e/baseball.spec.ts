import { test, expect } from "@playwright/test";

const BASEBALL = "/home/valentin/RL/TESTFLIGHTS/Baseball";

test("Baseball reconstruction in the UI", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("http://127.0.0.1:6473/");
  await expect(page.getByRole("heading", { name: /ExperimentAnalysis/i })).toBeVisible();
  await page.getByLabel(/name/i).fill("BaseballE2E");
  await page.getByRole("button", { name: /new/i }).click();
  await page.getByLabel(/import/i).fill(BASEBALL);
  await page.getByRole("button", { name: /import/i }).click();
  await expect(page.getByText("D2")).toBeVisible({ timeout: 240_000 });
  await expect(page.getByText("D3")).toBeVisible();
  await expect(page.getByText("D4")).toBeVisible();
  await expect(page.locator(".js-plotly-plot").first()).toBeVisible();
  await expect(page.getByRole("slider")).toBeVisible();
});
