import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// End-to-end tests run against a dev server with the deterministic offline mock LLM and a
// throwaway data directory, on port 3100 so they don't disturb a dev server on 3000.
const PORT = 3100;
// Outside the project: the dev server watches the project, and a data directory created
// inside it mid-run sends the page into a reload loop.
export const E2E_DATA_DIR = path.join(os.tmpdir(), "chiron-e2e-data");

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/status`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { LLM_MOCK: "1", CHIRON_DATA_DIR: E2E_DATA_DIR, NEXT_DIST_DIR: ".next-e2e" },
  },
});
