import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A test that asserts nothing passes whatever the code does.
    expect: { requireAssertions: true },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: ["packages/*/src/**/*.test.ts", "app/src/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, "packages/ui/**"],
        },
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
      include: ["packages/*/src/**/*.{ts,tsx}", "app/src/**/*.{ts,tsx}"],
      exclude: [
        "app/src/root.tsx",
        "app/src/entry.server.tsx",
        "packages/ui/src/**/*.stories.tsx",
        "packages/ui/src/Overview/Overview.tsx",
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
