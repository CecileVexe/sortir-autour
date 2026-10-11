import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end test of the main search journeys, fully deterministic:
 * real providers disabled, fictitious demo provider enabled, geocoding mocked in the browser.
 * Locally it uses the installed Microsoft Edge (PW_CHANNEL=msedge); in CI run `npx playwright install chromium`.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, locale: "fr-FR", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DEMO_DATA: "true",
      PROVIDER_OSM_ENABLED: "false",
      PROVIDER_DATATOURISME_ENABLED: "false",
      PROVIDER_OPENAGENDA_ENABLED: "false",
      AI_PROVIDER: "none",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
