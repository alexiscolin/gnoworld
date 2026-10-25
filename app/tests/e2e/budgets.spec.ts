import { cacheContents, controlled, expect, hydrated, PAGES, test, type Page } from "./fixtures.ts";

// ADR-0001 §12's budgets: at most 170 KB of compressed JavaScript before the first usable
// screen (the page hydrated; 150 KB until the chat, 160 KB until its Markdown, docs/decisions.md
// 2026-10-25 and 2026-10-26), 3 MB in all, the worker's precache included, as gzip sends them.
const FIRST_SCREEN_JS = 170 * 1024;
const TOTAL = 3 * 1024 * 1024;

const compressed = (page: Page, urls: readonly string[]) =>
  page.evaluate(async (list) => {
    let total = 0;
    for (const url of list) {
      const body = (await fetch(url, { cache: "no-store" })).body;
      if (body !== null)
        total += (await new Response(body.pipeThrough(new CompressionStream("gzip"))).arrayBuffer()).byteLength;
    }
    return total;
  }, urls);

for (const path of PAGES) {
  test(`${path} stays within its budgets`, async ({ page }) => {
    const scripts = new Set<string>();
    const all = new Set<string>();
    page.on("response", (response) => {
      all.add(response.url());
      if (response.request().resourceType() === "script") scripts.add(response.url());
    });
    await page.goto(path);
    await hydrated(page);
    const firstScreen = [...scripts];
    expect(firstScreen.length, "the page loads no script: the measure is empty").toBeGreaterThan(0);
    await controlled(page);
    for (const cached of (await cacheContents(page)).paths) all.add(new URL(cached, page.url()).href);
    expect(await compressed(page, firstScreen)).toBeLessThanOrEqual(FIRST_SCREEN_JS);
    expect(await compressed(page, [...all])).toBeLessThanOrEqual(TOTAL);
  });
}
