import { reactRouter } from "@react-router/dev/vite";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { cacheVersion, precacheList } from "./src/sw/precache.ts";

// The PWA's worker (ADR-0001 §12), in the browser's build only: src/sw/sw.ts becomes /sw.js, and
// the build's hashed files to precache, with their version, are written into it.
function serviceWorker(): Plugin {
  return {
    name: "gnoworld:service-worker",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    buildStart() {
      this.emitFile({ type: "chunk", id: fileURLToPath(new URL("src/sw/sw.ts", import.meta.url)), fileName: "sw.js" });
    },
    generateBundle(_options, bundle) {
      const worker = bundle["sw.js"];
      if (worker?.type !== "chunk") throw new Error("the build wrote no sw.js");
      const list = precacheList(Object.keys(bundle));
      const filled = fill(worker.code, "__GNOWORLD_PRECACHE__", JSON.stringify(list));
      worker.code = fill(filled, "__GNOWORLD_VERSION__", JSON.stringify(cacheVersion(list)));
    },
  };
}

function fill(code: string, name: string, value: string): string {
  const parts = code.split(name);
  if (parts.length !== 2) throw new Error(`sw.js names ${name} ${String(parts.length - 1)} times, not once`);
  return parts.join(value);
}

// The React Compiler memoizes every component (ADR-0002 §8); one it cannot compile fails the build.
export default defineConfig({
  plugins: [
    reactRouter(),
    babel({ presets: [reactCompilerPreset({ panicThreshold: "all_errors" })] }),
    serviceWorker(),
  ],
});
