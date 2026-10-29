import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "@react-router/dev/config";
import { outputs, pagesPolicy } from "./src/csp.ts";
import { loadData } from "./src/dataFiles.ts";
import { placesFrom } from "./src/dataPlaces.ts";
import { prerenderPaths } from "./src/prerender.ts";

// The data files are checked before anything builds: a malformed one throws here and stops the build, naming the file
// and the field (slice 5's 5c). GNOWORLD_DATA names another directory, for the tests.
const data = loadData(process.env["GNOWORLD_DATA"] ?? fileURLToPath(new URL("./data", import.meta.url)));

// No rendering server in production (ADR-0002 §2): one HTML file per place, built ahead.
export default {
  appDirectory: "src",
  ssr: false,
  prerender: prerenderPaths(placesFrom(data)),
  // After the pages are written (React Router's buildEnd follows the prerender): the policy that allows
  // their inline scripts, for a host that reads _headers, for nginx, and for the test host.
  async buildEnd({ reactRouterConfig: { buildDirectory } }) {
    const client = join(buildDirectory, "client");
    const files = (await readdir(client, { recursive: true })).filter((file) => file.endsWith(".html"));
    const pages = await Promise.all(files.map((file) => readFile(join(client, file), "utf8")));
    const { headers, nginx } = outputs(await pagesPolicy(pages));
    await writeFile(join(client, "_headers"), headers);
    await writeFile(join(buildDirectory, "csp.conf"), nginx);
  },
} satisfies Config;
