import { defineConfig, devices } from "@playwright/test";

// The site is built before every run, so no test reads an old build, then served as a static
// host serves it (tests/e2e/serve.mjs).
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: true,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    // ponytail: on macOS, one process, since Claude Code's sandbox refuses Chromium's Mach port
    // for its children; the CI runs Chromium as it ships. 1b-2's benches need it whole.
    launchOptions: { args: process.platform === "darwin" ? ["--single-process"] : [] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node_modules/.bin/react-router build && node tests/e2e/serve.mjs",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
