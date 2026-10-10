import { defineConfig } from "@playwright/test";

/**
 * End-to-end checks against a running Bekvor (`npm run test:e2e`). The app,
 * Postgres and — for the recognition checks — the recognition service must
 * already run; CI starts them (`.github/workflows/ci.yml`), locally see
 * `e2e/README.md`. Test audio is generated, never real music.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
});
