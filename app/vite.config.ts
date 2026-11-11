import { reactRouter } from "@react-router/dev/vite";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, defineConfig, parseSync, type Plugin } from "vite";
import { glslSpaces } from "./src/glsl.ts";
import { precached } from "./src/sw/precache.ts";
import { workshopDataFiles } from "./tests/e2e/workshopData.mjs";

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

// The data files the bundle holds are app/data's, or GNOWORLD_DATA's directory when it is set (the tests of the build
// plant their own): an import of one of app/data's files reads the file of the same name there.
const DATA = fileURLToPath(new URL("data", import.meta.url));
const dataFiles: Plugin = {
  name: "gnoworld:data",
  enforce: "pre",
  resolveId(source, importer) {
    const other = process.env["GNOWORLD_DATA"];
    if (other === undefined || importer === undefined || !source.endsWith(".json")) return null;
    const file = resolve(dirname(importer), source);
    return dirname(file) === DATA ? join(other, basename(file)) : null;
  },
};

// Baseline widely available (docs/DESIGN-SYSTEM.md, "Browsers") at the newest features the code uses: RegExp's `v` flag
// and Intl.Segmenter, as MDN's browser-compat-data 8.1.7 dates them. Vite's own default stops at 2026-01-01's (S1).
const TARGET = ["chrome112", "edge112", "firefox125", "safari17", "ios17"];

// One chunk each for the store, all of ui and the libraries two chunks share: 20 chunks, not 27, /w/bubble's first screen
// 173,363 B, not 178,495 B (F3157). The chat's and the lines' code stay behind their own chunks: budgets.spec.ts holds that.
// The order of the CSS layers does not hang on these groups: root.tsx links the layers' sheet first (F3260).
const CHUNKS = [
  // saveData goes with the store: the chat and the universe share it, and a file of its own costs a world's first screen 131 B. So does its
  // React binding, now the Earth's page and the chat both read it. The pages' one JSON call and the copy join it too: the first screen and the
  // first signals' chunk (features/world/Banners.tsx) share them, and a chunk of their own costs every world's first screen (slice 9h).
  {
    name: "store",
    test: /\/app\/src\/(?:store\/|storeContext\.tsx|lib\/saveData\.ts|lib\/api\/http\.ts$|lib\/copy\.ts$)/,
  },
  // Not the activity chart (F304), the stat (F2868), Avatar, Popover, Card, Skeleton (3 KB on every page, F2926), Breadcrumb, EmptyState,
  // Combobox, Field (7.7 KB, F2976), Tabs (the bell's panel at its first press, 482 B, slice 8), Progress and Sparkline (8i), and the plate's
  // Figures, Network, PagedList and Room (slice 13, D13979): the chunks that need them load them after the first screen.
  {
    name: "ui",
    test: /\/packages\/ui\/src\/(?!(?:ActivityChart|Stat|Avatar|Popover|Card|Skeleton|Breadcrumb|EmptyState|Combobox|Field|Row|Tabs|Progress|Sparkline|Figures|Network|PagedList)\/|(?:alone|flip|roomDom)\.tsx?$)/,
  },
  // three never: two lazy parts of the scene (the cosmos, a world's page) share some of it, and a share of two would put it on the first screen.
  { name: "vendor", test: /^(?!.*\/node_modules\/three\/).*\/node_modules\//, minShareCount: 2 },
];

// The workshop's dev servers, the app's and the lab's (scripts/workshop.sh gives each its port): this machine alone, the exact names
// WORKSHOP_HOSTS lists (its tailnet's), and by path the app, the packages and their store, which a worktree links into the main
// checkout's (the fonts' files); never the repository's root, whose deploy/ holds secrets.
export const workshopHosts = () => process.env["WORKSHOP_HOSTS"]?.split(",").filter(Boolean) ?? [];
export const workshopServer = () => ({
  host: "127.0.0.1",
  strictPort: true,
  allowedHosts: workshopHosts(),
  // A build of a copy of app/ alone (dataFiles.test.ts) has no packages beside it: a folder that is not there is allowed to no one.
  fs: {
    allow: ["./", "../packages", "../node_modules/.pnpm"]
      .map((path) => new URL(path, import.meta.url))
      .filter((url) => existsSync(url))
      .map((url) => realpathSync(url)),
  },
});

// The workshop's backend behind the app's dev server (scripts/workshop.sh starts it): its server's /api and Ergo's /ws on this machine, as
// nginx's are, the visitor's address set here and never the browser's. Vite's proxy is a dev server's, which no build reads; both ports,
// written plainly, or none.
export const workshopBackend = () => {
  const [api, ws] = [process.env["WORKSHOP_API_PORT"], process.env["WORKSHOP_WS_PORT"]].map((text) =>
    text !== undefined && /^\d{1,5}$/.test(text) && Number(text) >= 1 && Number(text) <= 65535 ? text : undefined,
  );
  if (api === undefined || ws === undefined) return undefined;
  return {
    "^/api/": { target: `http://127.0.0.1:${api}`, headers: { "x-real-ip": "127.0.0.1" } },
    "^/ws$": {
      target: `ws://127.0.0.1:${ws}`,
      ws: true,
      headers: { "x-forwarded-for": "127.0.0.1", "x-real-ip": "127.0.0.1" },
    },
  };
};

// The files the workshop's backend writes into WORKSHOP_DATA_DIR (scripts/workshop.sh), served at their names and nothing else of the folder
// (tests/e2e/workshopData.mjs); no plugin without the folder, and none in a build.
export const workshopData = (dir: string | undefined): Plugin[] =>
  dir === undefined || dir === ""
    ? []
    : [
        {
          name: "gnoworld:workshop-data",
          apply: "serve",
          configureServer(server) {
            server.middlewares.use(workshopDataFiles(dir));
          },
        },
      ];

/** A built chunk parsed, for the shaders' spaces to go (src/glsl.ts); the lab's build takes it too. */
export const parsed = (code: string) => parseSync("chunk.js", code, { sourceType: "module" }).program;

// The React Compiler memoizes every component (ADR-0002 §8); one it cannot compile fails the build.
export default defineConfig({
  plugins: [
    dataFiles,
    reactRouter(),
    babel({ presets: [reactCompilerPreset({ panicThreshold: "all_errors" })] }),
    glslSpaces(parsed),
    serviceWorker,
    workshopData(process.env["WORKSHOP_DATA_DIR"]),
  ],
  build: { target: TARGET, rolldownOptions: { output: { codeSplitting: { groups: CHUNKS } } } },
  server: { ...workshopServer(), proxy: workshopBackend() },
});
