import { expect, hydrated, test, type Page } from "./fixtures.ts";

// ADR-0001 §12's budgets: at most 150 KB of compressed JavaScript before the first usable
// screen (the page hydrated), 3 MB in all, the worker's precache included, as gzip sends them.
// (Seen failing with each budget lowered by hand: the gate's probe is frozen.)
const FIRST_SCREEN_JS = 150 * 1024;
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

for (const path of ["/", "/w/bubble"]) {
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
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    for (const url of await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys())
        for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
      return urls;
    }))
      all.add(url);
    expect(await compressed(page, firstScreen)).toBeLessThanOrEqual(FIRST_SCREEN_JS);
    expect(await compressed(page, [...all])).toBeLessThanOrEqual(TOTAL);
  });
}
