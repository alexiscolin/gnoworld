import { reactRouter } from "@react-router/dev/vite";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The React Compiler memoizes every component (ADR-0002 §8); one it cannot compile fails the build.
export default defineConfig({
  plugins: [reactRouter(), babel({ presets: [reactCompilerPreset({ panicThreshold: "all_errors" })] })],
});
