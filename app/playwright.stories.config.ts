import { tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const sandboxed = Boolean(process.env["SANDBOX_RUNTIME"]);
// The file server's port: 6007, or the one check.sh picked free for this run, so gates of several worktrees run at once.
const port = Number(process.env["STORIES_PORT"] ?? 6007);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error(`STORIES_PORT is no port: ${String(process.env["STORIES_PORT"])}`);
// Where Storybook is built: the design system's folder, or the one check.sh gives the fast gate, whose copy outside a
// repository would read a build left in the tree (jscpd, knip) while the lane that builds it runs beside theirs.
const DEFAULT_OUT = "../packages/ui/storybook-static";
const out = process.env["STORIES_OUT"] ?? DEFAULT_OUT;
// Storybook deletes that folder before it builds, and the command below is a shell's: so any value but the default is the
// `storybook` folder of a `check.*` run folder directly inside the temporary one, as check.sh makes it, a plain absolute
// path: no other folder worth keeping can be hit by a variable left set (security-S6, CR7).
const RUN_FOLDER = /^check\.\w+\/storybook$/;
if (
  out !== DEFAULT_OUT &&
  (!/^\/[\w@%+=:,./-]+$/.test(out) || !RUN_FOLDER.test(relative(resolve(tmpdir()), resolve(out)).split(sep).join("/")))
)
  throw new Error(
    `STORIES_OUT must be the storybook folder of a check.* folder directly inside ${tmpdir()}, which Storybook deletes before it builds: ${out}`,
  );

// The design system's stories in a browser (tests/stories): Storybook built before every run, so no
// test reads an old build, then served as files. The full gate runs it; the fast one stays under 60 s.
export default defineConfig({
  testDir: "tests/stories",
  forbidOnly: true,
  // The evidence of a failed run has a folder of its own: Playwright empties its default, app/test-results, as a run
  // starts, and the journeys run beside this lane (CR4). In a gate it is the run's folder.
  outputDir: out === DEFAULT_OUT ? "test-results-stories" : resolve(out, "..", "stories-results"),
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
