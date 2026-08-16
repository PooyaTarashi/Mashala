import { defineConfig, devices } from "@playwright/test";

const nextOrigin = "http://127.0.0.1:3100";
const fixtureOrigin = "http://127.0.0.1:3101";
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: fixtureOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions:
      chromiumExecutablePath === undefined
        ? undefined
        : { executablePath: chromiumExecutablePath },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3100",
      url: nextOrigin,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        GEMINI_API_KEY: "",
        GEMINI_MODEL: "e2e-unused",
        MASHALA_RAG_SERVICE_URL: "http://127.0.0.1:9",
      },
    },
    {
      command: "node e2e/fixtures/vertical-slice-gateway.mjs",
      url: `${fixtureOrigin}/__e2e/health`,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      env: {
        MASHALA_E2E_FIXTURE_ORIGIN: fixtureOrigin,
        MASHALA_E2E_NEXT_ORIGIN: nextOrigin,
      },
    },
  ],
});
