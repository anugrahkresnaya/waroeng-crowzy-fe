import { defineConfig, devices } from "@playwright/test";

// UI smoke tests drive the real app in the installed Chrome (no browser download needed).
// Next allows one dev server per folder: if one is already running, point E2E_PORT at it (for example 3000).
const port = Number(process.env.E2E_PORT ?? 3100);
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    channel: "chrome",
    viewport: { width: 400, height: 860 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "phone", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 400, height: 860 } } }],
  webServer: {
    command: `npm run dev -- -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
