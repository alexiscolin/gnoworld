// The tests that count renders: the app's components compiled as the build compiles them (vite.config.ts), in jsdom.
// Without the compiler a component recomputes on every render, so a count of its work says nothing. Each is named
// here and left out of the node project (vitest.config.ts): a test sits beside the file it tests, under its name.
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [babel({ presets: [reactCompilerPreset({ panicThreshold: "all_errors" })] })],
  test: {
    name: "compiled",
    include: ["src/features/chat/Lines.test.tsx"],
    environment: "jsdom",
    expect: { requireAssertions: true },
  },
});
