import { defineConfig, devices } from "@playwright/test";

// The design system's stories in a browser (tests/stories): Storybook built before every run, so no
// test reads an old build, then served as files. The full gate runs it; the fast one stays under 60 s.
export default defineConfig({
  testDir: "tests/stories",
  forbidOnly: true,
  fullyParallel: true,
  // In the sandbox, Chromium runs as one process, and eight at once each building Storybook's pages crash.
  ...(process.env["SANDBOX_RUNTIME"] ? { workers: 1 } : {}),
  use: {
    baseURL: "http://127.0.0.1:6007",
    launchOptions: { args: process.env["SANDBOX_RUNTIME"] ? ["--single-process"] : [] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The file server's log of each request goes nowhere; Storybook's build still reports its errors.
    command:
      "../packages/ui/node_modules/.bin/storybook build -c ../packages/ui/.storybook -o ../packages/ui/storybook-static --quiet && python3 -I -m http.server 6007 --bind 127.0.0.1 --directory ../packages/ui/storybook-static 2>/dev/null",
    url: "http://127.0.0.1:6007/index.json",
    timeout: 180_000,
  },
});
