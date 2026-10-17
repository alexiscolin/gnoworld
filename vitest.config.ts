import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    // A test that asserts nothing passes whatever the code does.
    expect: { requireAssertions: true },
    coverage: {
      // Every source file counts, tested or not, so an untested file shows as 0%.
      include: ["packages/*/src/**/*.{ts,tsx}"],
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
