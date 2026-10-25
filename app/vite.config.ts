import { reactRouter } from "@react-router/dev/vite";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, defineConfig, type Plugin } from "vite";
import { precached } from "./src/sw/precache.ts";

// The PWA's worker (ADR-0001 §12): src/sw/sw.ts built on its own into /sw.js, one classic script, with the
// files it precaches (hashed ones and the shell) and their digests. Built once the whole build is done:
// React Router writes its route manifest in the server build, and its pages after the client build.
const serviceWorker: Plugin = {
  name: "gnoworld:service-worker",
  apply: "build",
  buildApp: {
    order: "post",
    async handler(builder) {
      const client = builder.environments["client"];
      if (client === undefined) throw new Error("no browser build to precache");
      const out = resolve(builder.config.root, client.config.build.outDir);
      // Each file's digest spelled once, as the worker checks it (src/sw/digest.ts, F342).
      const list = await precached(
        readdirSync(out, { recursive: true }),
        (name) => new Uint8Array(readFileSync(join(out, name))),
      );
      await build({
        configFile: false,
        root: builder.config.root,
        logLevel: "warn",
        publicDir: false,
        define: { __GNOWORLD_PRECACHE__: JSON.stringify(list) },
        build: {
          outDir: out,
          emptyOutDir: false,
          rolldownOptions: {
            input: fileURLToPath(new URL("src/sw/sw.ts", import.meta.url)),
            output: { format: "iife", entryFileNames: "sw.js" },
          },
        },
      });
    },
  },
};

// The React Compiler memoizes every component (ADR-0002 §8); one it cannot compile fails the build.
export default defineConfig({
  plugins: [reactRouter(), babel({ presets: [reactCompilerPreset({ panicThreshold: "all_errors" })] }), serviceWorker],
});
