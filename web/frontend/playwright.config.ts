import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:6473",
  },
  webServer: [
    {
      command:
        "rm -rf /tmp/ea-e2e-experiments && ../backend/.venv/bin/uvicorn app:app --host 127.0.0.1 --port 6400",
      cwd: "../backend",
      url: "http://127.0.0.1:6400/api/experiments",
      reuseExistingServer: true,
      env: {
        EA_EXPERIMENTS_DIR: "/tmp/ea-e2e-experiments",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 6473",
      url: "http://127.0.0.1:6473",
      reuseExistingServer: true,
      env: {
        CHOKIDAR_USEPOLLING: "true",
      },
    },
  ],
});
