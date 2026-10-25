import { defineConfig, devices } from "@playwright/test";
import { SITE } from "./tests/e2e/sites.ts";

// The site is built before every run, so no test reads an old build, then served as a static
// host serves it (tests/e2e/serve.mjs).
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
    command: "node_modules/.bin/react-router build && node tests/e2e/serve.mjs",
    url: `${SITE}/`,
    timeout: 120_000,
  },
});
