import fs from "node:fs";

const EXPERIMENTS_DIR = "/tmp/ea-e2e-experiments";

export default function globalSetup() {
  fs.rmSync(EXPERIMENTS_DIR, { recursive: true, force: true });
}
