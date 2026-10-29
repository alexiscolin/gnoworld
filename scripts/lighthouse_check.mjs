// The Lighthouse check of slice 5's 5e: SEO and accessibility at 100 on `/` and on a world, against a built site
// served at the URL given (`node scripts/lighthouse_check.mjs http://localhost:4173`). Not in the gate: its
// dependency, `lighthouse`, is Alexis's to add (docs/plans/slice-5.md §8). Without it the check says so and fails.
import { spawnSync } from "node:child_process";

const base = process.argv[2];
if (base === undefined) {
  console.error("usage: node scripts/lighthouse_check.mjs <base url of the built site>");
  process.exit(2);
}
const PAGES = ["/", "/w/bubble"];
let failed = false;
for (const page of PAGES) {
  const run = spawnSync(
    "npx",
    [
      "--no-install",
      "lighthouse",
      base + page,
      "--only-categories=seo,accessibility",
      "--output=json",
      "--quiet",
      "--chrome-flags=--headless",
    ],
    { encoding: "utf8" },
  );
  if (run.status !== 0) {
    console.error(
      `lighthouse is not installed or failed on ${page} (its dependency is not added yet): ${run.stderr.trim()}`,
    );
    process.exit(2);
  }
  const { categories } = JSON.parse(run.stdout);
  for (const id of ["seo", "accessibility"]) {
    const score = Math.round(categories[id].score * 100);
    console.log(`${page} ${id}: ${score}`);
    if (score !== 100) failed = true;
  }
}
process.exit(failed ? 1 : 0);
