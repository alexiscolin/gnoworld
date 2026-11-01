import { defineConfig } from "vite";

// The realism page (lab/realism.html), built beside the site for the journeys and on its own for Alexis's eye: the deployment runs
// `react-router build`, which never sees it. LAB_HOSTS names the tailnet's addresses `vite preview` may answer, exactly, never a wildcard.
const hosts = process.env["LAB_HOSTS"]?.split(",").filter(Boolean) ?? [];

export default defineConfig({
  root: "lab",
  base: "/lab/",
  publicDir: "../public",
  build: {
    outDir: "../build/client/lab",
    emptyOutDir: true,
    rolldownOptions: { input: "lab/realism.html" },
  },
  preview: { host: "127.0.0.1", port: 5199, strictPort: true, allowedHosts: hosts },
});
