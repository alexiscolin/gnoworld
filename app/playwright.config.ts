import { defineConfig, devices } from "@playwright/test";
import { SITE } from "./tests/e2e/sites.ts";

const TLS = process.env["E2E_TLS"] === "1";
// ceiling: in Claude Code's sandbox, one process, since the sandbox refuses Chromium's Mach port for its children; everywhere
// else, Chromium as it ships. Benches run outside it.
const ONE_PROCESS = process.env["SANDBOX_RUNTIME"] ? ["--single-process"] : [];

// The site is built before every run, so no test reads an old build, then served as a static
// host serves it (tests/e2e/serve.mjs), with a real server and a real Ergo behind it.
export default defineConfig({
  testDir: "tests/e2e",
  // The journeys alone: crowd.test.mjs is node:test's, and listed here it printed before the JSON check_regressions reads.
  testMatch: "**/*.spec.ts",
  forbidOnly: true,
  fullyParallel: true,
  use: {
    baseURL: SITE,
    launchOptions: { args: ONE_PROCESS },
    // E2E_TLS=1 serves the hosts on https under a key made for the run (serve.mjs): no browser knows it. A journey's own Node
    // fetch of the site (pwa.spec's) does not take it either.
    ignoreHTTPSErrors: TLS,
  },
  // E2E_WEBKIT=1 adds Safari's engine beside Chromium, for a run outside the sandbox (WebKit does not start inside it); the gate
  // runs Chromium alone. Under E2E_TLS, Chromium takes the run's key for the service worker's script too, which
  // ignoreHTTPSErrors leaves out; whether WebKit registers a worker under it is not known.
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: [...ONE_PROCESS, ...(TLS ? ["--ignore-certificate-errors"] : [])] },
      },
    },
    ...(process.env["E2E_WEBKIT"] === "1" ? [{ name: "webkit", use: { ...devices["Desktop Safari"] } }] : []),
  ],
  webServer: {
    command: "node_modules/.bin/react-router build && node tests/e2e/serve.mjs",
    // A test build: `?test-gpu` lets the scene run on the software GPU these browsers have (features/universe/gpu.ts).
    env: { VITE_GNOWORLD_TEST_GPU: "1" },
    url: `${SITE}/`,
    ignoreHTTPSErrors: TLS,
    timeout: 120_000,
    // TERM, not Playwright's default KILL: Ergo and the server stop, and their folders go (api.mjs).
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
