import { defineConfig, devices } from "@playwright/test";

const sandboxed = Boolean(process.env["SANDBOX_RUNTIME"]);
// The file server's port: 6007, or the one GitHub's job or a run by hand picks free, so runs of several worktrees go at once.
const port = Number(process.env["STORIES_PORT"] ?? 6007);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error(`STORIES_PORT is no port: ${String(process.env["STORIES_PORT"])}`);
// Where Storybook is built: the design system's folder.
const out = "../packages/ui/storybook-static";

// The design system's stories in a browser (tests/stories): Storybook built before every run, so no
// test reads an old build, then served as files. GitHub's unit-browser job runs it for a change of the design system or the harness.
export default defineConfig({
  testDir: "tests/stories",
  forbidOnly: true,
  // The evidence of a failed run has a folder of its own: Playwright empties its default, app/test-results, as a run
  // starts, and the journeys may run beside it (CR4).
  outputDir: "test-results-stories",
  fullyParallel: true,
  // One folder of approved pictures per platform (slice 2's plan, the pictures' answer), compared to
  // the pixel: Playwright's default tolerance let a border go from 20% to 10% white unseen (F218).
  snapshotPathTemplate: "{testDir}/__screenshots__/{platform}/{arg}{ext}",
  expect: { toHaveScreenshot: { threshold: 0, maxDiffPixels: 0 } },
  // In the sandbox, Chromium runs as one process, and eight at once each building Storybook's pages crash.
  ...(sandboxed ? { workers: 1 } : {}),
  use: {
    baseURL: `http://127.0.0.1:${String(port)}`,
    launchOptions: { args: sandboxed ? ["--single-process"] : [] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The file server's log of each request goes nowhere; Storybook's build still reports its errors.
    command: `../packages/ui/node_modules/.bin/storybook build -c ../packages/ui/.storybook -o ${out} --quiet && python3 -I -m http.server ${String(port)} --bind 127.0.0.1 --directory ${out} 2>/dev/null`,
    url: `http://127.0.0.1:${String(port)}/index.json`,
    timeout: 180_000,
  },
});
