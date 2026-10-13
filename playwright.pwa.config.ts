import { defineConfig, devices } from "@playwright/test";

// Tests the production build (static export + service worker) as a static host would serve it.
export default defineConfig({
  testDir: "./e2e-pwa",
  timeout: 60_000,
  reporter: "list",
  use: { baseURL: "http://localhost:3200", channel: "chrome", viewport: { width: 400, height: 860 }, trace: "retain-on-failure" },
  projects: [{ name: "pwa", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 400, height: 860 } } }],
  webServer: {
    command: "npm run build && node scripts/serve-out.mjs 3200",
    url: "http://localhost:3200",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
