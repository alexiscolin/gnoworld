import { configDefaults, defineConfig } from "vitest/config";

const SLOW = ["server/src/testing/ergo*.test.ts", "server/src/testing/soak.test.ts"];

export default defineConfig({
  test: {
    // A test that asserts nothing passes whatever the code does.
    expect: { requireAssertions: true },
    projects: [
      // The app's components compiled, which count their renders (app/vitest.compiled.config.ts).
      "app/vitest.compiled.config.ts",
      {
        extends: true,
        test: {
          name: "node",
          include: ["packages/*/src/**/*.test.ts", "app/src/**/*.test.{ts,tsx}", "server/src/**/*.test.ts"],
          exclude: [
            ...configDefaults.exclude,
            "packages/ui/**",
            "app/src/features/chat/Lines.test.tsx",
            "app/src/features/chat/composing.test.tsx",
            ...SLOW,
          ],
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
