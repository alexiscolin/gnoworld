import { cacheContents, controlled, expect, hydrated, isWorld, PAGES, test, type Page } from "./fixtures.ts";

// ADR-0001 §12's budgets: compressed JavaScript before the first usable screen (the page
// hydrated; its steps in docs/decisions.md, the last 177 KiB for slice 9 on 2026-11-06), 3 MB in all, the worker's
// precache included, as gzip sends them.
const FIRST_SCREEN_JS = 177 * 1024;
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
// A world with a realm reads its proposals from the chain once hydrated (world.tsx, F2977): their chunk is asked after the first
// screen, and the scripts only it needs with it. The first screen counts the scripts the others need.
const PROPOSALS = /\/assets\/Proposals-[\w-]+\.js$/;
// A world's pinned actions (9e-1, D271), on its plate and in its chat's bar, come in one chunk asked after hydration by a world that
// pins one alone; the scripts only it needs come with it.
const PINNED = /\/assets\/Pinned-[\w-]+\.js$/;

// The scripts the page's others import, as each file's own static imports say (`from"./x.js"`, `import"./x.js"`, never a dynamic
// `import("./x.js")`), from the roots that are no other's import, the chunks asked after the first screen apart.
const withoutLater = (page: Page, urls: readonly string[], skip: readonly string[]) =>
  page.evaluate(
    async ([list, skipped]) => {
      const edges = new Map<string, string[]>();
      for (const url of list) {
        const text = await (await fetch(url, { cache: "no-store" })).text();
        edges.set(
          url,
          [...text.matchAll(/(?:\bfrom|\bimport)\s*"\.\/([\w.-]+\.js)"/g)].map(
            (found) => new URL(found[1] ?? "", url).href,
          ),
        );
      }
      const imported = new Set([...edges.values()].flat());
      const kept = new Set<string>();
      const walk = (url: string) => {
        if (kept.has(url) || !edges.has(url)) return;
        kept.add(url);
        for (const next of edges.get(url) ?? []) walk(next);
      };
      for (const url of list) if (!skipped.includes(url) && !imported.has(url)) walk(url);
      return [...kept];
    },
    [[...urls], skip] as const,
  );

// A world someone charted (slice 9h, D210): its plate names who, from the stream, so a guest's first screen also asks for the
// plate's line; the stream is handed the signal here, as no journey charts Bubble (D218).
const CHARTED = "/w/bubble";
const signalFrame = () =>
  `event: signal\ndata: ${JSON.stringify({
    kind: "chart",
    world: "bubble",
    account: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
    at: new Date().toISOString(),
  })}\n\nevent: since\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`;

for (const [path, charted] of [...PAGES.map((each) => [each, false] as const), [CHARTED, true] as const]) {
  test(`${path}${charted ? ", charted," : ""} stays within its budgets`, async ({ page }) => {
    if (charted)
      await page.route("**/api/stream?*", (route) =>
        route.fulfill({ contentType: "text/event-stream", body: signalFrame() }),
      );
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
    // A world that pins asks for the pinned actions' code once the proposals' code has drawn the plate, after the chat's scripts
    // may all have come: measured once it has, not as the timing falls (3 runs in 6 counted none before it, on slice-9a).
    const pinnedCode = path.includes("govdao")
      ? page.waitForResponse((response) => PINNED.test(response.url()))
      : undefined;
    await page.goto(path);
    await hydrated(page);
    await stream;
    await chat;
    await pinnedCode;
    if (charted) await expect(page.getByText(/^First charted by @g1jg8m/)).toBeVisible();
    await expect.poll(() => pending.size, "the scripts the chat's code asks for come").toBe(0);
    const asked = [...scripts].filter((url) => PROPOSALS.test(url));
    // Only a world with a realm asks for the proposals' code.
    expect(asked.length > 0, "a world asks for the proposals' code when it has a realm").toBe(path.includes("govdao"));
    const pinned = [...scripts].filter((url) => PINNED.test(url));
    // Only a world that pins an action asks for their code: GovDAO.
    expect(pinned.length, "a world asks for the pinned actions' code when it pins one").toBe(
      path.includes("govdao") ? 1 : 0,
    );
    const later = [...asked, ...pinned];
    const firstScreen = later.length === 0 ? [...scripts] : await withoutLater(page, [...scripts], later);
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
