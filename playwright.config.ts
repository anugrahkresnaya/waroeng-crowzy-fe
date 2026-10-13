import { defineConfig, devices } from "@playwright/test";

// UI smoke tests drive the real app in the installed Chrome (no browser download needed).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    channel: "chrome",
    viewport: { width: 400, height: 860 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "phone", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 400, height: 860 } } }],
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
