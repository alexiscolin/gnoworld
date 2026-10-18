import { reactRouter } from "@react-router/dev/vite";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { cacheVersion, precacheList } from "./src/sw/precache.ts";

// The PWA's worker (ADR-0001 §12): src/sw/sw.ts becomes /sw.js in the browser's build. Its list of
// hashed files, with their version, is written once the whole build is done: React Router writes
// its route manifest during the server build, after the browser's.
const serviceWorker: Plugin[] = [
  {
    name: "gnoworld:service-worker",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    buildStart() {
      this.emitFile({ type: "chunk", id: fileURLToPath(new URL("src/sw/sw.ts", import.meta.url)), fileName: "sw.js" });
    },
  },
  {
    name: "gnoworld:service-worker-precache",
    apply: "build",
    buildApp: {
      order: "post",
      handler(builder) {
        const out = resolve(builder.config.root, builder.environments["client"]?.config.build.outDir ?? "");
        const list = precacheList(readdirSync(join(out, "assets")).map((name) => `assets/${name}`));
        const worker = join(out, "sw.js");
        const filled = fill(readFileSync(worker, "utf8"), "__GNOWORLD_PRECACHE__", JSON.stringify(list));
        writeFileSync(worker, fill(filled, "__GNOWORLD_VERSION__", JSON.stringify(cacheVersion(list))));
        return Promise.resolve();
      },
    },
  },
];

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
    ...serviceWorker,
  ],
});
