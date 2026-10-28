import { readFileSync } from "node:fs";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig, type TestProjectInlineConfiguration } from "vitest/config";
import { BENCHES } from "./lint/shared.config.ts";

// Every Vitest run reads this file, so every run is on the Node .node-version pins: another V8 reads some regexes
// otherwise (F816: StrykerJS on Homebrew's Node 26), and its results would be of a toolchain nobody ships. Probed in
// scripts/probe.py (pinned_node), with the pin as process.version writes it: v24.22.0.
const PINNED = `v${readFileSync(new URL(".node-version", import.meta.url), "utf8").trim()}`;
if (process.version !== PINNED)
  throw new Error(`Vitest runs on Node ${PINNED} (.node-version), not ${process.version}`);

const SLOW = ["server/src/testing/ergo*.test.ts", "server/src/testing/soak.test.ts"];

// core's tests a second time, in Playwright's Chromium: the browser's engine reads some regexes and Unicode otherwise
// than Node's (F816, F817). The project exists only when CORE_CHROMIUM is set, so the coverage,
// StrykerJS, `vitest list` and a file run alone never open a browser.
const CORE_CHROMIUM: TestProjectInlineConfiguration = {
  extends: true,
  test: {
    name: "core_chromium",
    include: ["packages/core/src/**/*.test.ts"],
    // The files one after another: Chromium in one process (Claude Code's sandbox, as app/playwright.config.ts)
    // dies on a second browser context.
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      // A failure writes no screenshot beside the code: the probe fails a planted test on purpose.
      screenshotFailures: false,
      provider: playwright({
        launchOptions: { args: process.env["SANDBOX_RUNTIME"] ? ["--single-process"] : [] },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
};

export default defineConfig({
  test: {
    // A test that asserts nothing passes whatever the code does.
    expect: { requireAssertions: true },
    // The benches are the files ESLint's BENCHES and scripts/repo_files.py's BENCH_FILE read, `*.bench.ts(x)`: Vitest's own
    // default, `*.{bench,benchmark}.?(c|m)[jt]s?(x)`, ran files no guard names, switched off or not (CR3; probe bench_files).
    benchmark: { include: BENCHES },
    projects: [
      // The app's components compiled, which count their renders (app/vitest.compiled.config.ts).
      "app/vitest.compiled.config.ts",
      {
        extends: true,
        test: {
          name: "node",
          include: ["packages/*/src/**/*.test.ts", "app/src/**/*.test.{ts,tsx}", "server/src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "packages/ui/**", "app/src/features/chat/Lines.test.tsx", ...SLOW],
        },
      },
      {
        // The real Ergo's tests and the check's soak: the full gate runs them, the fast gate leaves them.
        extends: true,
        test: { name: "slow", include: SLOW },
      },
      {
        // The design system's components, rendered in jsdom through their stories.
        extends: true,
        test: {
          name: "ui",
          include: ["packages/ui/src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["packages/ui/src/testSetup.ts"],
          // Vitest reads a stylesheet as empty unless named here: the token page reads the token file.
          css: { include: [/tokens\.css/] },
        },
      },
      // Only when CORE_CHROMIUM is set, as the full gate's step does.
      ...(process.env["CORE_CHROMIUM"] ? [CORE_CHROMIUM] : []),
    ],
    coverage: {
      // Every source file counts, tested or not, so an untested file shows as 0%.
      // The app too, but for the document shell and the server entry, which only the build
      // renders, and Storybook's pages, whose handlers do nothing: the Playwright journeys walk them.
      include: ["packages/*/src/**/*.{ts,tsx}", "app/src/**/*.{ts,tsx}", "server/src/**/*.ts"],
      exclude: [
        "app/src/root.tsx",
        "app/src/entry.server.tsx",
        "packages/ui/src/**/*.stories.tsx",
        "packages/ui/src/Overview/Overview.tsx",
        // The server's entry runs in child processes, which coverage does not follow: main.test.ts drives it.
        "server/src/main.ts",
      ],
      reporter: ["text-summary", "json"],
      // 85% everywhere (Alexis, 2026-10-17); core's rules at 100%, branches 95%.
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
        "packages/core/**": { lines: 100, functions: 100, branches: 95, statements: 100 },
      },
    },
  },
});
