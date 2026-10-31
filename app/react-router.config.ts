import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "@react-router/dev/config";
import { outputs, pagePolicies } from "./src/csp.ts";
import { connectSrc, rpcOrigins } from "./src/cspOrigins.ts";
import { loadData } from "./src/dataFiles.ts";
import { placesFrom } from "./src/dataPlaces.ts";
import { prerenderPaths } from "./src/prerender.ts";
import { robotsTxt, sitemapXml } from "./src/sitemap.ts";

// The data files are checked before anything builds: a malformed one throws here and stops the build, naming the file
// and the field (slice 5's 5c). GNOWORLD_DATA names another directory, for the tests.
const data = loadData(process.env["GNOWORLD_DATA"] ?? fileURLToPath(new URL("./data", import.meta.url)));

// The origins connect-src names beside 'self' (5g): the universes' https RPC, from the data. Read here, before anything
// builds, so an http:, wildcard or odd RPC stops the build before any page is written.
const origins = rpcOrigins(data.universes);

// No rendering server in production (ADR-0002 §2): one HTML file per place, built ahead.
export default {
  appDirectory: "src",
  ssr: false,
  prerender: prerenderPaths(placesFrom(data)),
  // After the pages are written (React Router's buildEnd follows the prerender): a policy for each page, holding its own
  // scripts' hashes, for a host that reads _headers, for nginx, and for the test host (5f).
  async buildEnd({ reactRouterConfig: { buildDirectory } }) {
    const client = join(buildDirectory, "client");
    const files = (await readdir(client, { recursive: true })).filter((file) => file.endsWith(".html"));
    const pages = Object.fromEntries(
      await Promise.all(files.map(async (file) => [file, await readFile(join(client, file), "utf8")] as const)),
    );
    // The service worker's script runs under the policy of its own answer: a _headers host gives it the bare one. Vite's post
    // hook writes sw.js after this runs (F2458), so the build does not look for it: a rule for a file never written is harmless.
    const { headers, nginx } = outputs(await pagePolicies(pages, origins), ["sw.js"]);
    // What connect-src names, printed at every build so a data file adding a host shows (the plan's §3).
    console.info(`csp: ${connectSrc(origins)}`);
    await writeFile(join(client, "_headers"), headers);
    await writeFile(join(buildDirectory, "csp.conf"), nginx);
    // What a search engine reads: the mainnet's places, from the data the pages were built from.
    await writeFile(join(client, "sitemap.xml"), sitemapXml(data));
    await writeFile(join(client, "robots.txt"), robotsTxt());
  },
} satisfies Config;
