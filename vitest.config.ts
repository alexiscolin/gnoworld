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

// A StrykerJS run cut short leaves its sandboxes here, and a bench measured them (5n: Cmd-K at 27 to 41 ms, not 2 to 4).
// Only a bench can reach the folder: the projects' includes are anchored at the root. check.sh empties it too.
const STRYKER_TMP = "**/.stryker-tmp/**";
const SLOW = ["server/src/testing/ergo*.test.ts", "server/src/testing/soak.test.ts"];

// The tests the inventory (.claude/tmp/slice-8/reports/inventory-tests.md) marks display-only: props, classes, variants, markup, the look
// of a world, small view components. They stay in the repository, and run in the `display` and `display_ui` projects, on demand
// (`vitest run --project display --project display_ui`) and in `check.sh --everything`, not in the default `test` and `coverage` runs.
const DISPLAY_UI = [
  "packages/ui/src/{Avatar,Breadcrumb,Button,Card,ChatLayout,Chip,EmptyState,Kicker,Logo,NavItem,Overview,Panel,PlanetThumb,Row,Skeleton,Sparkline,Stat,TokensPage,compositions,icons}/**/*.test.{ts,tsx}",
  "packages/ui/src/tokens.test.ts",
];
const DISPLAY = [
  "app/src/routes/*.test.tsx",
  "app/src/{shell,slots,root,routerLink}.test.tsx",
  "app/src/scene/earth/{look,maps}.test.ts",
  "app/src/scene/planet/{light,maps,signShaders}.test.ts",
  "app/src/scene/world/shaders.test.ts",
  "app/src/scene/cosmos/maps.test.ts",
  "app/src/features/world/*.test.tsx",
  "app/src/features/chat/{ChatHeader,LineHead,MessageBox,NoticeModes,OnlyKnown,PersonCard,PlaceInfo,QuickActions,Reactions,RoomChips,RoomMenu,RoomSections,Saved,SavedView}.test.tsx",
  "app/src/features/realms/{ReadSource,RealmCard,RealmFacts}.test.tsx",
  "app/src/features/universe/{Credits,FlightPanel}.test.tsx",
  "app/src/features/home/{Height,GoExplore,LatestOnX}.test.tsx",
  "app/src/features/list/PlacesList.test.tsx",
  "app/src/features/update/UpdatePrompt.test.tsx",
  "app/src/features/follow/FollowButton.test.tsx",
  "app/src/features/events/Calendar.test.tsx",
  "app/src/features/account/AccountMenu.test.tsx",
  "app/src/features/share/ShareSheet.test.tsx",
  "app/src/features/settings/DeviceSection.test.tsx",
  "app/src/features/previews/{Preview,PreviewCard}.test.tsx",
];

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
    // A bound in wall-clock time, or a test whose timeout holds one: a commit's gate leaves it, the merge check and --full run it
    // (Alexis, 2026-11-04, "Oui, les deux": other gates' load failed them for nothing; check.sh, docs/HARNESS.md).
    tags: [
      {
        name: "timing",
        description: "a bound in wall-clock time: the merge check and --full run it, a commit's gate does not",
      },
    ],
    // The `beforeAll` that draws a RoomView once, to load its lazy lines' view, takes under a second alone and past Vitest's
    // 10 s on a machine at load 50 to 120, where the files' first transforms queue (F3200): a hook gets a minute.
    hookTimeout: 60_000,
    // The benches are the files ESLint's BENCHES and scripts/repo_files.py's BENCH_FILE read, `*.bench.ts(x)`: Vitest's own
    // default, `*.{bench,benchmark}.?(c|m)[jt]s?(x)`, ran files no guard names, switched off or not (CR3; probe bench_files).
    benchmark: { include: BENCHES, exclude: [...configDefaults.exclude, STRYKER_TMP] },
    projects: [
      // The app's components compiled, which count their renders (app/vitest.compiled.config.ts).
      "app/vitest.compiled.config.ts",
      {
        extends: true,
        test: {
          name: "node",
          include: [
            "packages/*/src/**/*.test.ts",
            "app/src/**/*.test.{ts,tsx}",
            "server/src/**/*.test.ts",
            "jarvis/src/**/*.test.ts",
          ],
          exclude: [
            ...configDefaults.exclude,
            "packages/ui/**",
            "app/src/features/chat/Lines.test.tsx",
            "app/src/features/chat/composing.test.tsx",
            "app/src/features/chat/lineFlash.test.tsx",
            ...SLOW,
            ...DISPLAY,
          ],
        },
      },
      {
        // The display-only tests of the app, on demand (see DISPLAY).
        extends: true,
        test: { name: "display", include: DISPLAY, exclude: [...configDefaults.exclude, "packages/ui/**"] },
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
          exclude: [...configDefaults.exclude, ...DISPLAY_UI],
          environment: "jsdom",
          setupFiles: ["packages/ui/src/testSetup.ts"],
          // Vitest reads a stylesheet as empty unless named here: the token page reads the token file.
          css: { include: [/tokens\.css/] },
        },
      },
      {
        // The design system's display-only tests, on demand (see DISPLAY_UI): the same environment as `ui`.
        extends: true,
        test: {
          name: "display_ui",
          include: DISPLAY_UI,
          environment: "jsdom",
          setupFiles: ["packages/ui/src/testSetup.ts"],
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
      // By default (the speed plan, Alexis 2026-11-06): tier 1 of docs/REVIEW.md, core and jarvis, whose floors below hold. `check.sh --everything`
      // sets COVERAGE_ALL: every file, as before, with the display-only tests run too.
      include: process.env["COVERAGE_ALL"]
        ? ["packages/*/src/**/*.{ts,tsx}", "app/src/**/*.{ts,tsx}", "server/src/**/*.ts", "jarvis/src/**/*.ts"]
        : [
            "packages/core/src/**/*.{ts,tsx}",
            "{server/src/login,app/src/features/login,app/src/lib/ergo,server/src/roles,app/src/lib/adena,app/src/sw,server/src/ergo,jarvis/src}/**/*.{ts,tsx}",
            "{app/src/lib/api/login.ts,app/src/csp.ts,app/src/cspOrigins.ts,app/src/cspForms.ts,app/src/lib/chain/evalCall.ts,server/src/guard.ts,server/src/limit.ts,server/src/config.ts,app/src/features/chat/embeds.ts,app/src/features/chat/Embed.tsx,app/src/features/realms/useExternalLinks.tsx,app/src/leaving.tsx,app/src/pagePath.ts}",
            "{packages/service/src/net.ts,packages/service/src/settings.ts}",
          ],
      exclude: [
        "app/src/root.tsx",
        "app/src/entry.server.tsx",
        "packages/ui/src/**/*.stories.tsx",
        "packages/ui/src/Overview/Overview.tsx",
        // The server's entry and jarvis's run in child processes, which coverage does not follow: their main.test.ts
        // drive them.
        "server/src/main.ts",
        "jarvis/src/main.ts",
      ],
      reporter: ["text-summary", "json"],
      // 85% everywhere (Alexis, 2026-10-17). Core at what slices 7 and 8's hardening measured, never under 90 (Alexis, 2026-11-05);
      // docs/REVIEW.md's tier-1 files at 100% of lines, functions and statements, their branches as measured (the rest are `??` no
      // input reaches: 8n's and 8r's lists). A glob's thresholds hold its files together, so 100 there is 100 for each file.
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
        "packages/core/**": { lines: 99.9, functions: 100, branches: 92.3, statements: 99.7 },
        "{server/src/login,app/src/features/login,app/src/lib/ergo,server/src/roles,app/src/lib/adena,packages/core/src/chain,packages/core/src/markdown,app/src/sw,server/src/ergo}/**":
          { lines: 100, functions: 100, statements: 100, branches: 97.2 },
        "{app/src/lib/api/login.ts,app/src/csp.ts,app/src/cspOrigins.ts,app/src/cspForms.ts,app/src/lib/chain/evalCall.ts,server/src/guard.ts,server/src/limit.ts,server/src/config.ts,app/src/features/chat/embeds.ts,app/src/features/chat/Embed.tsx,app/src/features/realms/useExternalLinks.tsx,app/src/leaving.tsx,app/src/pagePath.ts}":
          { lines: 100, functions: 100, statements: 100, branches: 97.3 },
        "{packages/service/src/net.ts,packages/service/src/settings.ts}": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 97.2,
        },
      },
    },
  },
});
