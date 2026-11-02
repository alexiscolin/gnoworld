import { renameSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

// The realism page (lab/realism.html), built beside the site for the journeys and on its own for Alexis's eye. LAB_HOSTS names the
// addresses `vite preview` may answer, exactly. LAB_STATIC, an absolute folder, builds a static `index.html` with relative paths.
const hosts = process.env["LAB_HOSTS"]?.split(",").filter(Boolean) ?? [];
const folder = process.env["LAB_STATIC"];

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
  base: "./",
  publicDir: "../public",
  plugins: folder === undefined ? [] : [asIndex],
  build: {
    outDir: folder ?? "../build/client/lab",
    emptyOutDir: true,
    rolldownOptions: { input: "lab/realism.html" },
  },
  preview: { host: "127.0.0.1", port: 5199, strictPort: true, allowedHosts: hosts },
});
