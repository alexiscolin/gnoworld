import { cacheContents, controlled, expect, hydrated, isWorld, PAGES, test, type Page } from "./fixtures.ts";

// ADR-0001 §12's budgets: compressed JavaScript before the first usable screen (the page
// hydrated; its steps in docs/decisions.md, the last on 2026-10-31), 3 MB in all, the worker's
// precache included, as gzip sends them.
const FIRST_SCREEN_JS = 173 * 1024;
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

// A world's chat comes after hydration (Chat.tsx's boundary), its lines' view only once a room holds a line
// (RoomView.tsx's): the first screen counts the chat, every run, and never the lines' view (F960, the green pass's G6).
const CHAT = /\/assets\/ChatPanel-[\w-]+\.js$/;
const LINES = /\/assets\/Lines-[\w-]+\.js$/;

for (const path of PAGES) {
  test(`${path} stays within its budgets`, async ({ page }) => {
    const scripts = new Set<string>();
    const all = new Set<string>();
    const pending = new Set<unknown>();
    page.on("request", (request) => {
      if (request.resourceType() === "script") pending.add(request);
    });
    page.on("requestfinished", (request) => pending.delete(request));
    page.on("requestfailed", (request) => pending.delete(request));
    page.on("response", (response) => {
      // A world page's verdicts stream (an EventSource) has no end to count: what the page downloads to run is.
      if (response.request().resourceType() === "eventsource") return;
      all.add(response.url());
      if (response.request().resourceType() === "script") scripts.add(response.url());
    });
    const world = isWorld(path);
    // The chat's socket answers nothing: no line comes, so nothing asks the lines' view but a fault.
    if (world) await page.routeWebSocket(/\/ws$/, () => undefined);
    const chat = world ? page.waitForResponse((response) => CHAT.test(response.url())) : undefined;
    // A world page opens its verdicts stream: measured once it has, every run, not as the timing falls.
    const stream = world ? page.waitForResponse((response) => response.url().includes("/api/stream")) : undefined;
    await page.goto(path);
    await hydrated(page);
    await stream;
    await chat;
    await expect.poll(() => pending.size, "the scripts the chat's code asks for come").toBe(0);
    const firstScreen = [...scripts];
    expect(firstScreen.length, "the page loads no script: the measure is empty").toBeGreaterThan(0);
    expect(
      firstScreen.filter((url) => LINES.test(url)),
      "the lines' view stays behind its boundary",
    ).toEqual([]);
    await controlled(page);
    for (const cached of (await cacheContents(page)).paths) all.add(new URL(cached, page.url()).href);
    expect(await compressed(page, firstScreen)).toBeLessThanOrEqual(FIRST_SCREEN_JS);
    expect(await compressed(page, [...all])).toBeLessThanOrEqual(TOTAL);
  });
}
