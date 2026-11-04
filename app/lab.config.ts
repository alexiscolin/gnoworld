import { realpathSync, renameSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { glslSpaces } from "./src/glsl.ts";
import { parsed } from "./vite.config.ts";

// The realism page (lab/realism.html), built beside the site for the journeys and on its own for Alexis's eye, and served by the workshop's
// dev server (docs/DEVELOPMENT.md). LAB_HOSTS names the addresses either server may answer, exactly. LAB_STATIC, an absolute folder, builds
// a static `index.html` with relative paths.
const hosts = process.env["LAB_HOSTS"]?.split(",").filter(Boolean) ?? [];
const folder = process.env["LAB_STATIC"];
// Beside the site, in the site's build folder: app/build, or GNOWORLD_BUILD (react-router.config.ts).
const built = process.env["GNOWORLD_BUILD"];
// What the workshop's dev server serves by path over the tailnet: the app, the packages, and their store, which a worktree links into the
// main checkout's (the fonts' files). Never the repository's root, whose deploy/ holds secrets.
const served = ["./", "../packages", "../node_modules/.pnpm"].map((path) =>
  realpathSync(new URL(path, import.meta.url)),
);

// Written, the page is renamed: Vite names an html file as its source. The folder must be absolute.
const asIndex: Plugin = {
  name: "gnoworld:lab-index",
  apply: "build",
  writeBundle() {
    if (folder !== undefined) renameSync(join(folder, "realism.html"), join(folder, "index.html"));
  },
};

export default defineConfig({
  root: "lab",
  // The workshop's switch, here alone: the scene's tunable values read the panel's (src/scene/tuning.ts); a site's build never has it.
  define: { "import.meta.env.GNOWORLD_TUNING": JSON.stringify("1") },
  base: "./",
  publicDir: "../public",
  // The shaders the journeys walk here are stripped as the site's are (src/glsl.ts).
  plugins: [glslSpaces(parsed), ...(folder === undefined ? [] : [asIndex])],
  build: {
    outDir: folder ?? (built === undefined ? "../build/client/lab" : join(built, "client", "lab")),
    emptyOutDir: true,
    rolldownOptions: { input: "lab/realism.html" },
  },
  // The dev server scans its entry from the lab's root, where the build's `lab/realism.html` (from app/) is not.
  optimizeDeps: { entries: ["realism.html"] },
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
    allowedHosts: hosts,
    fs: { allow: served },
  },
  preview: { host: "127.0.0.1", port: 5199, strictPort: true, allowedHosts: hosts },
});
