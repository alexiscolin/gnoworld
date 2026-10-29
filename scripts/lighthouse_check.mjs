// The Lighthouse check of slice 5's 5e: SEO and accessibility at 100 on `/` and on a world, against a built site served at
// the URL given (`node scripts/lighthouse_check.mjs http://localhost:4173`), in Playwright's Chromium.
// Open: a testnet's pages are noindex and Lighthouse's is-crawlable fails on that (F2355, Alexis's answer pending).
import lighthouse from "lighthouse";
import { chromium } from "playwright";

const base = process.argv[2];
if (base === undefined) {
  console.error("usage: node scripts/lighthouse_check.mjs <base url of the built site>");
  process.exit(2);
}
const PAGES = ["/", "/w/bubble"];
const PORT = 9222;
const browser = await chromium.launch({ args: [`--remote-debugging-port=${String(PORT)}`] });
let failed = false;
try {
  for (const page of PAGES) {
    const run = await lighthouse(base + page, { port: PORT, output: "json", onlyCategories: ["seo", "accessibility"] });
    for (const id of ["seo", "accessibility"]) {
      const score = Math.round((run?.lhr.categories[id]?.score ?? 0) * 100);
      console.log(`${page} ${id}: ${score}`);
      if (score !== 100) failed = true;
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
