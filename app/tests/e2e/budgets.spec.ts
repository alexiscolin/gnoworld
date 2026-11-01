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
// The Earth alone holds both the chat and the door to space: its chat waits for the load and the door (useSpace.ts), so its chunk leaves the first
// screen here, by this name alone, and only once this page proves it came after them. The chief's call, 2026-11-02, for Alexis: 7f2's report.
const DOOR = /\/assets\/mountUniverse-[\w-]+\.js$/;
const isEarth = (path: string) => path.endsWith("/earth");
const LINES = /\/assets\/Lines-[\w-]+\.js$/;
// A world with a realm reads its proposals from the chain once hydrated (world.tsx, F2977): their chunk is asked after the first
// screen, and the scripts only it needs with it. The first screen counts the scripts the others need.
const PROPOSALS = /\/assets\/Proposals-[\w-]+\.js$/;
// three and the scene: a chunk of their own, asked after the text and never by a phone before View in space. `?test-gpu` lets the
// gate's software GPU through. The mark is a word of three's WebGLRenderer that no minifier renames.
const SCENE = /\/assets\/scene-[\w-]+\.js$/;
const SCENE_JS = 150 * 1024;
const THREE_MARK = "isWebGLRenderer";

// The scripts the page's others import, as each file's own static imports say (`from"./x.js"`, `import"./x.js"`, never a dynamic
// `import("./x.js")`), from the roots that are no other's import, the chunk that comes late apart.
const without = (page: Page, urls: readonly string[], skip: string) =>
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
        if (kept.has(url) || !edges.has(url) || url === skipped) return;
        kept.add(url);
        for (const next of edges.get(url) ?? []) walk(next);
      };
      for (const url of list) if (url !== skipped && !imported.has(url)) walk(url);
      return [...kept];
    },
    [[...urls], skip] as const,
  );

// The Earth's chat, once its page holds one: exactly one chunk of that name, named by no preload, and asked after the load and the door ended.
async function lateChat(page: Page, path: string, scripts: ReadonlySet<string>) {
  if (!isEarth(path) || (await page.locator("#chat").count()) === 0) return undefined;
  await expect.poll(() => [...scripts].filter((url) => CHAT.test(url)).length).toBe(1);
  expect(await (await page.request.get(path)).text(), "no preload names the chat").not.toContain("ChatPanel");
  const { chunk, loaded, door } = await page.evaluate(
    ([chat, gate]) => {
      const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      const entry = (name: string) =>
        performance.getEntriesByType("resource").find((each) => new RegExp(name).test(each.name)) as
          PerformanceResourceTiming | undefined;
      return {
        chunk: entry(chat)?.startTime ?? 0,
        loaded: navigation?.loadEventEnd ?? Infinity,
        door: entry(gate)?.responseEnd ?? Infinity,
      };
    },
    [CHAT.source, DOOR.source] as const,
  );
  expect(chunk, "the chat's chunk is asked after the load").toBeGreaterThanOrEqual(loaded);
  expect(chunk, "the chat's chunk is asked after the door came").toBeGreaterThanOrEqual(door);
  return [...scripts].find((url) => CHAT.test(url));
}

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
    if (world || isEarth(path)) await page.routeWebSocket(/\/ws$/, () => undefined);
    const chat = world ? page.waitForResponse((response) => CHAT.test(response.url())) : undefined;
    // A world page opens its verdicts stream: measured once it has, every run, not as the timing falls.
    const stream = world ? page.waitForResponse((response) => response.url().includes("/api/stream")) : undefined;
    await page.goto(path);
    await hydrated(page);
    await stream;
    await chat;
    await expect.poll(() => pending.size, "the scripts the chat's code asks for come").toBe(0);
    const asked = [...scripts].filter((url) => PROPOSALS.test(url));
    // Only a world with a realm asks for the proposals' code.
    expect(asked.length > 0, "a world asks for the proposals' code when it has a realm").toBe(path.includes("govdao"));
    const late = asked[0] ?? (await lateChat(page, path, scripts));
    const firstScreen = late === undefined ? [...scripts] : await without(page, [...scripts], late);
    expect(firstScreen.length, "the page loads no script: the measure is empty").toBeGreaterThan(0);
    expect(
      firstScreen.filter((url) => LINES.test(url)),
      "the lines' view stays behind its boundary",
    ).toEqual([]);
    await controlled(page);
    for (const cached of (await cacheContents(page)).paths) all.add(new URL(cached, page.url()).href);
    expect(await compressed(page, firstScreen)).toBeLessThanOrEqual(FIRST_SCREEN_JS);
    expect(await compressed(page, [...all])).toBeLessThanOrEqual(TOTAL);
    const holdingThree = await page.evaluate(
      async ([list, mark]) => {
        const texts = await Promise.all(
          list.map(async (url) => [url, await (await fetch(url, { cache: "no-store" })).text()] as const),
        );
        return texts.filter(([, text]) => text.includes(mark)).map(([url]) => url);
      },
      [firstScreen, THREE_MARK] as const,
    );
    expect(holdingThree, "nothing of three on the first screen").toEqual([]);
  });
}

test("the scene's chunk holds three, and stays within its cap", async ({ page }) => {
  const scene = page.waitForResponse((response) => SCENE.test(response.url()));
  await page.goto("/?test-gpu");
  await hydrated(page);
  const url = (await scene).url();
  expect(await (await page.request.get(url)).text()).toContain(THREE_MARK);
  expect(await compressed(page, [url])).toBeLessThanOrEqual(SCENE_JS);
});
