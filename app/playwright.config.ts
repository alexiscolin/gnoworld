import { defineConfig, devices } from "@playwright/test";
import { SITE } from "./tests/e2e/sites.ts";

// The site is built before every run, so no test reads an old build, then served as a static
// host serves it (tests/e2e/serve.mjs), with a real server and a real Ergo behind it.
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: true,
  fullyParallel: true,
  use: {
    baseURL: SITE,
    // ponytail: in Claude Code's sandbox, one process, since the sandbox refuses Chromium's Mach
    // port for its children; everywhere else, Chromium as it ships. 1b-2's benches run outside it.
    launchOptions: { args: process.env["SANDBOX_RUNTIME"] ? ["--single-process"] : [] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The realism page goes beside the site for the journeys alone: the deployment's `react-router build` never sees it.
    command:
      "node_modules/.bin/react-router build && node_modules/.bin/vite build --config lab.config.ts && node tests/e2e/serve.mjs",
    // A test build: `?test-gpu` lets the scene run on the software GPU these browsers have (features/universe/gpu.ts).
    env: { VITE_GNOWORLD_TEST_GPU: "1" },
    url: `${SITE}/`,
    timeout: 120_000,
    // TERM, not Playwright's default KILL: Ergo and the server stop, and their folders go (api.mjs).
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
