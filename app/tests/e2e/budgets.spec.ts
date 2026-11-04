import { readFileSync } from "node:fs";
import { cacheContents, controlled, expect, hydrated, isWorld, PAGES, test, type Page } from "./fixtures.ts";

// ADR-0001 §12's budgets: compressed JavaScript before the first usable screen (the page
// hydrated; its steps in docs/decisions.md, the last on 2026-11-04: 174 KiB for the phone's view switch), 3 MB in all, the worker's
// precache included, as gzip sends them.
const FIRST_SCREEN_JS = 174 * 1024;
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
// A page that holds both the chat and the door to space, the Earth's and a world's: its chat waits for the load and the door (useSpace.ts), so
// its chunk leaves the first screen here, by this name alone, and only once the page proves it came after them. The chief's calls, 2026-11-02,
// for Alexis: 7f2's report for the Earth, 7e's for a world.
const DOOR = /\/assets\/mountUniverse-[\w-]+\.js$/;
const holdsDoor = (path: string) => path.endsWith("/earth") || isWorld(path);
// What leaves the first screen keeps a cap of its own, so a chat that grows behind the door is still measured (7e's red pass, 12).
const LATE_CHAT_JS = 21 * 1024;
const LINES = /\/assets\/Lines-[\w-]+\.js$/;
// A world with a realm reads its proposals from the chain once hydrated (world.tsx, F2977): their chunk is asked after the first
// screen, and the scripts only it needs with it. The first screen counts the scripts the others need.
const PROPOSALS = /\/assets\/Proposals-[\w-]+\.js$/;
// three and the scene: a chunk of their own, asked after the text and never by a phone before View in space. `?test-gpu` lets the
// gate's software GPU through. The mark is a word of three's WebGLRenderer that no minifier renames.
const SCENE = /\/assets\/scene-[\w-]+\.js$/;
// 156 KiB since 7e (Alexis, 2026-11-02): a second lazy part made rolldown split the scene's shared modules out of its chunk; 160,000 B for
// the rail's planet portraits, drawn by the planets' own code through the scene's renderer (Alexis, 2026-11-03). Lowered to 158,208 B once
// the shaders' spaces were stripped (Alexis, 2026-11-03, after 7v), keeping room for 7i's portraits and 7b8's warm air.
const SCENE_JS = 158_208;
// The cosmos, a chunk of its own: only the home that shows worlds asks for it.
const COSMOS = /\/assets\/cosmos-[\w-]+\.js$/;
// 16 KiB again since 7d6 gave the nebulae a chunk of their own (Alexis, 2026-11-02); 16,512 B once the rail's portraits shared the maps'
// chunks with it, 16.5 KiB with 7v's views (Alexis, 2026-11-03); 17 KiB after 7v's merge with the night's parts (Alexis, 2026-11-04).
const COSMOS_JS = 17 * 1024;
// A world's page's part of the scene, its own chunk: about 9.4 KB with the maps it shares with the cosmos (7e, 2026-11-02).
// The whole cosmos, past a cluster's distance (7d5): its own chunk, asked once the eye leaves for it.
const WHOLE = /\/assets\/web-[\w-]+\.js$/;
const WHOLE_JS = 5 * 1024;
// The view at rest's search and eye (7d6) with the home's dive and dissolve (7d7), and the nebulae (7d6): lazy chunks the home asks once
// its cosmos shows, first capped a tenth or so over their weight (7d7: 6,771 B and 3,492 B). The view at rest's: 10 KiB since 7p's depth,
// 10.5 KiB with 7v's views (Alexis, 2026-11-03, docs/decisions.md).
const REST = /\/assets\/restSearch-[\w-]+\.js$/;
const REST_JS = 10.5 * 1024;
const NEBULAE = /\/assets\/nebulae-[\w-]+\.js$/;
const NEBULAE_JS = 3.75 * 1024;
// The cosmos's labels (7h): their own chunk, asked once the cosmos stands, so neither the scene's nor the cosmos's cap pays for them; first
// the part's 5,960 B, 6 KiB once the rail shared their ranking, titles, reading and band (Alexis, 2026-11-03: two chunks of their own, the
// price of sharing), 6.5 KiB with 7v's views, the Plan's loader and its chunk's preloads (Alexis, 2026-11-03).
const LABELS = /\/assets\/labelled-[\w-]+\.js$/;
const LABELS_JS = 6.5 * 1024;
// The flights (7g): camera-controls, the streaks and the veil, a chunk of their own the scene asks for once it runs, so neither the scene's
// cap nor the cosmos's pays for them. Its first value is the part's: its size at the part's end and about a tenth. The mark is a word of
// camera-controls' own warning, which no minifier renames.
const FLIGHTS = /\/assets\/flights-[\w-]+\.js$/;
const FLIGHTS_JS = 18 * 1024;
const FLIGHTS_MARK = "camera-controls:";
// The rail (7i) and its planets' portraits: chunks of their own, asked once the cosmos's worlds stand on a computer, outside the scene's and
// the cosmos's caps. Their first caps are the part's (the chief, 2026-11-03): 6,408 B and 1,712 B measured, and about a tenth.
const RAIL = /\/assets\/Rail-[\w-]+\.js$/;
const RAIL_JS = 7 * 1024;
const PORTRAITS = /\/assets\/portraits-[\w-]+\.js$/;
const PORTRAITS_JS = 1900;
const RECORDED_WORLDS = readFileSync(new URL("../../lab/worlds.json", import.meta.url), "utf8");
// A system's arrival (7d3), its dynamic view (7v): a chunk the view at rest's asks the first time a system is, found by name from the scene's
// chunk to the cosmos's to the view at rest's. First capped at its size and about a tenth (1,518 B, the chief); 2 KiB with the dynamic view
// (Alexis, 2026-11-03).
const COSMOS_NAMED = /\.\/(cosmos-[\w-]+\.js)/;
const REST_NAMED = /\.\/(restSearch-[\w-]+\.js)/;
const ARRIVAL_NAMED = /\.\/(restArrival-[\w-]+\.js)/;
const ARRIVAL_JS = 2 * 1024;
// The view at rest in depth (7p): its far bodies and rocks in a chunk the view at rest's names, the rocks drawn by one the labels' name, its
// program in no chunk loaded first. First caps their sizes and a tenth (rocks 1,204 B, depth 2,534 B); the depth 3.5 KiB with 7v's views
// (Alexis, 2026-11-03), 3,605 B with the labels' place it shares (7p2, the size margin given ahead, 2026-11-04).
const DEEP_NAMED = /\.\/(restDeep-[\w-]+\.js)/;
const DEEP_JS = 3605;
const LABELS_NAMED = /\.\/(labelled-[\w-]+\.js)/;
const ROCKS_NAMED = /\.\/(rocks-[\w-]+\.js)/;
const ROCKS_JS = 1325;
const ROCKS_MARK = "aRock";
// A system's Plan and the Earth's (7v): a chunk the view at rest's names, asked the first time a Plan is, weighed apart from the labels' too,
// which the cosmos asks first and whose names' code it shares; the Plan's orbits and names, a chunk the labels' name. First caps, each its
// size once its reviews' fixes landed and about a tenth: 2,248 B (the design review's lens, level and spacing, F4470) and 2,147 B.
const PLAN_NAMED = /\.\/(restPlan-[\w-]+\.js)/;
const PLAN_JS = 2470;
const ORBITS_NAMED = /\.\/(orbits-[\w-]+\.js)/;
const ORBITS_JS = 2360;
const WORLD_PART = /\/assets\/part-[\w-]+\.js$/;
const WORLD_JS = 12 * 1024;
const THREE_MARK = "isWebGLRenderer";
// Every world but the Earth (7b5): its program and its recipe, a chunk of its own the cosmos asks for with its worlds' maps, so neither
// the scene's chunk nor the cosmos's pays for it. The mark is a uniform of its program that no minifier renames.
const GENERATED = /\/assets\/generated-[\w-]+\.js$/;
// 10 KiB since 2026-11-03 (Alexis, docs/decisions.md, up to 10 KiB for 7b8): its temperate worlds' coasts, shapes and climates and the
// cream veins took 9,325 B, 109 past 9 KiB; their size plus a tenth passes 10 KiB, the most he gave.
const GENERATED_JS = 10 * 1024;
const GENERATED_MARK = "minorShare";

// A static import between two built files (`from"./x.js"`, `import"./x.js"`), never a dynamic `import("./x.js")`.
const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*"\.\/([\w.-]+\.js)"/g;

// The scripts the page's others import, as each file's own static imports say, from the roots that are no other's import, the chunk that
// comes late apart.
const without = (page: Page, urls: readonly string[], skip: readonly string[]) =>
  page.evaluate(
    async ([list, skipped, pattern]) => {
      const edges = new Map<string, string[]>();
      for (const url of list) {
        const text = await (await fetch(url, { cache: "no-store" })).text();
        edges.set(
          url,
          [...text.matchAll(new RegExp(pattern, "g"))].map((found) => new URL(found[1] ?? "", url).href),
        );
      }
      const imported = new Set([...edges.values()].flat());
      const kept = new Set<string>();
      const walk = (url: string) => {
        if (kept.has(url) || !edges.has(url) || skipped.includes(url)) return;
        kept.add(url);
        for (const next of edges.get(url) ?? []) walk(next);
      };
      for (const url of list) if (!skipped.includes(url) && !imported.has(url)) walk(url);
      return [...kept];
    },
    [[...urls], skip, STATIC_IMPORT.source] as const,
  );

// What a late chunk brings: it and every chunk it imports statically that was not there already. A chunk weighed alone would let a split
// carry its code out of every cap (7e's review, B2-1).
async function ownOf(page: Page, late: string, there: readonly string[]): Promise<string[]> {
  const brought = new Set(there);
  return (await closureOf(page, late)).filter((each) => !brought.has(each));
}

// A script and every script it imports statically, read file by file by the test, not the page: a page that draws the scene on a software GPU
// is too busy to read twenty files in time.
async function closureOf(page: Page, start: string): Promise<string[]> {
  const seen = new Set<string>();
  const next = [start];
  for (let url = next.pop(); url !== undefined; url = next.pop()) {
    if (seen.has(url)) continue;
    seen.add(url);
    const text = await (await page.request.get(url)).text();
    for (const found of text.matchAll(new RegExp(STATIC_IMPORT.source, "g")))
      next.push(new URL(found[1] ?? "", url).href);
  }
  return [...seen];
}

// The address of the late chunk a built file names in its dynamic imports, by `pattern`'s first group.
async function namedIn(page: Page, url: string, pattern: RegExp): Promise<string> {
  const name = pattern.exec(await (await page.request.get(url)).text())?.[1];
  expect(name, `${url} names its late chunk`).toBeDefined();
  return new URL(name ?? "", url).href;
}

// The chat of a page that holds the door, once it holds one: exactly one chunk of that name, named by no preload, and asked after the load and
// the door ended.
async function lateChat(page: Page, path: string, scripts: ReadonlySet<string>) {
  if (!holdsDoor(path) || (await page.locator("#chat").count()) === 0) return undefined;
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
    if (world || holdsDoor(path)) await page.routeWebSocket(/\/ws$/, () => undefined);
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
    const late = [asked[0], await lateChat(page, path, scripts)].filter((url) => url !== undefined);
    const firstScreen = await without(page, [...scripts], late);
    const lateChunk = late.find((url) => CHAT.test(url));
    if (lateChunk !== undefined)
      expect(
        await compressed(page, await ownOf(page, lateChunk, firstScreen)),
        "the late chat stays within its cap",
      ).toBeLessThanOrEqual(LATE_CHAT_JS);
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

test("the cosmos's chunk stays within its cap, and the scene's holds none of it", async ({ page }) => {
  const cosmos = page.waitForResponse((response) => COSMOS.test(response.url()));
  const scene = page.waitForResponse((response) => SCENE.test(response.url()));
  await page.goto("/?test-gpu");
  await hydrated(page);
  const there = await closureOf(page, (await scene).url());
  expect(await compressed(page, await ownOf(page, (await cosmos).url(), there))).toBeLessThanOrEqual(COSMOS_JS);
});

test("the whole cosmos's chunk stays within its cap, apart from the cosmos's and the scene's", async ({ page }) => {
  const whole = page.waitForResponse((response) => WHOLE.test(response.url()));
  const cosmos = page.waitForResponse((response) => COSMOS.test(response.url()));
  const scene = page.waitForResponse((response) => SCENE.test(response.url()));
  await page.goto("/?test-gpu");
  await hydrated(page);
  await page.locator("canvas[data-scene='on']").waitFor({ state: "attached" });
  await page.evaluate(() => {
    const view = Reflect.get(globalThis, "__gnoworldScene") as {
      moveTo: (to: { x: number; y: number; z: number }) => void;
      stats: () => { eye: { x: number; y: number; z: number } };
    };
    const { eye } = view.stats();
    view.moveTo({ x: eye.x, y: eye.y, z: eye.z + 900 });
  });
  const there = [...(await closureOf(page, (await scene).url())), ...(await closureOf(page, (await cosmos).url()))];
  expect(await compressed(page, await ownOf(page, (await whole).url(), there))).toBeLessThanOrEqual(WHOLE_JS);
});

// The home's scene chunk, once the page hydrated: each late chunk is found by name from it, chunk by chunk.
async function homeScene(page: Page): Promise<string> {
  const asked = page.waitForResponse((response) => SCENE.test(response.url()));
  await page.goto("/?test-gpu");
  await hydrated(page);
  return (await asked).url();
}

// A late chunk the view at rest's names by `named`, within `cap` apart from the view at rest's, the cosmos's and the scene's, and the
// labels' where `labels` says so.
async function restLateWithin(
  page: Page,
  { named, cap, labels = false }: { named: RegExp; cap: number; labels?: boolean },
): Promise<void> {
  const scene = await homeScene(page);
  const cosmos = await namedIn(page, scene, COSMOS_NAMED);
  const rest = await namedIn(page, cosmos, REST_NAMED);
  const before = labels ? [scene, cosmos, rest, await namedIn(page, scene, LABELS_NAMED)] : [scene, cosmos, rest];
  const there = (await Promise.all(before.map((url) => closureOf(page, url)))).flat();
  expect(await compressed(page, await ownOf(page, await namedIn(page, rest, named), there))).toBeLessThanOrEqual(cap);
}

// The chunks the labels' names come after: the scene's, the cosmos's and the labels' own, and all they import.
async function labelsThere(page: Page) {
  const scene = await homeScene(page);
  const cosmos = await namedIn(page, scene, COSMOS_NAMED);
  const labels = await namedIn(page, scene, LABELS_NAMED);
  const there = (await Promise.all([scene, cosmos, labels].map((url) => closureOf(page, url)))).flat();
  return { scene, cosmos, labels, there };
}

test("a system's arrival's chunk stays within its cap, apart from the view at rest's, the cosmos's and the scene's", async ({
  page,
}) => {
  await restLateWithin(page, { named: ARRIVAL_NAMED, cap: ARRIVAL_JS });
});

test("the view at rest's depth chunk stays within its cap, apart from the view at rest's, the cosmos's and the scene's", async ({
  page,
}) => {
  await restLateWithin(page, { named: DEEP_NAMED, cap: DEEP_JS });
});

test("a Plan's chunk stays within its cap, apart from the view at rest's, the labels', the cosmos's and the scene's", async ({
  page,
}) => {
  await restLateWithin(page, { named: PLAN_NAMED, cap: PLAN_JS, labels: true });
});

test("the Plan's orbits' chunk stays within its cap, apart from the labels', the cosmos's and the scene's", async ({
  page,
}) => {
  const { labels, there } = await labelsThere(page);
  expect(
    await compressed(page, await ownOf(page, await namedIn(page, labels, ORBITS_NAMED), there)),
  ).toBeLessThanOrEqual(ORBITS_JS);
});

test("the rocks' chunk stays within its cap, apart from the labels', the cosmos's and the scene's, which hold none of it", async ({
  page,
}) => {
  const { scene, cosmos, labels, there } = await labelsThere(page);
  const rocks = await namedIn(page, labels, ROCKS_NAMED);
  expect(await compressed(page, await ownOf(page, rocks, there))).toBeLessThanOrEqual(ROCKS_JS);
  for (const url of [...(await closureOf(page, scene)), ...(await closureOf(page, cosmos))])
    expect(await (await page.request.get(url)).text(), url).not.toContain(ROCKS_MARK);
});

for (const [name, chunk, cap] of [
  ["view at rest's", REST, REST_JS],
  ["nebulae's", NEBULAE, NEBULAE_JS],
  ["labels'", LABELS, LABELS_JS],
] as const)
  test(`the ${name} chunk stays within its cap, apart from the cosmos's and the scene's`, async ({ page }) => {
    const late = page.waitForResponse((response) => chunk.test(response.url()));
    const cosmos = page.waitForResponse((response) => COSMOS.test(response.url()));
    const scene = page.waitForResponse((response) => SCENE.test(response.url()));
    await page.goto("/?test-gpu");
    await hydrated(page);
    const there = [...(await closureOf(page, (await scene).url())), ...(await closureOf(page, (await cosmos).url()))];
    expect(await compressed(page, await ownOf(page, (await late).url(), there))).toBeLessThanOrEqual(cap);
  });

test("the rail's and its portraits' chunks come once the cosmos's worlds stand, each within its own cap, apart from the cosmos's and the scene's", async ({
  page,
}) => {
  await page.route("**/worlds.json", (route) =>
    route.fulfill({ body: RECORDED_WORLDS, contentType: "application/json" }),
  );
  const asked = (chunk: RegExp) => page.waitForResponse((response) => chunk.test(response.url()));
  const [rail, portraits, cosmos, scene] = [asked(RAIL), asked(PORTRAITS), asked(COSMOS), asked(SCENE)];
  await page.goto("/?test-gpu");
  await hydrated(page);
  const there = [...(await closureOf(page, (await scene).url())), ...(await closureOf(page, (await cosmos).url()))];
  expect(await compressed(page, await ownOf(page, (await rail).url(), there))).toBeLessThanOrEqual(RAIL_JS);
  expect(await compressed(page, await ownOf(page, (await portraits).url(), there))).toBeLessThanOrEqual(PORTRAITS_JS);
});

test("the flights' chunk holds camera-controls, comes once the scene runs, within its own cap, and the scene's holds none of it", async ({
  page,
}) => {
  const flights = page.waitForResponse((response) => FLIGHTS.test(response.url()));
  const scene = page.waitForResponse((response) => SCENE.test(response.url()));
  await page.goto("/?test-gpu");
  await hydrated(page);
  const [sceneUrl, flightsUrl] = [(await scene).url(), (await flights).url()];
  const there = await closureOf(page, sceneUrl);
  const own = await ownOf(page, flightsUrl, there);
  expect(await (await page.request.get(flightsUrl)).text()).toContain(FLIGHTS_MARK);
  for (const url of there) expect(await (await page.request.get(url)).text()).not.toContain(FLIGHTS_MARK);
  expect(await compressed(page, own)).toBeLessThanOrEqual(FLIGHTS_JS);
});

test("a world's part of the scene stays within its cap", async ({ page }) => {
  const part = page.waitForResponse((response) => WORLD_PART.test(response.url()));
  const scene = page.waitForResponse((response) => SCENE.test(response.url()));
  await page.goto("/w/bubble?test-gpu");
  await hydrated(page);
  const there = await closureOf(page, (await scene).url());
  expect(await compressed(page, await ownOf(page, (await part).url(), there))).toBeLessThanOrEqual(WORLD_JS);
});

// The shaders' spaces stripped at build (Alexis, 2026-11-03): three's own, which the scene's chunk ships, read as a compiler reads them, in the
// site's build and the lab's beside it, which the journeys walk.
test("ships the scene's shaders stripped of their spaces, in the site's build and the lab's", async ({ page }) => {
  for (const [path, pattern] of [
    ["/?test-gpu", SCENE],
    ["/lab/realism.html?view=cosmos", /\/lab\/assets\/[\w-]+\.js$/],
  ] as const) {
    const texts: string[] = [];
    page.on("response", (response) => {
      if (pattern.test(response.url())) texts.push(response.url());
    });
    await page.goto(path);
    await expect
      .poll(
        async () => {
          const bodies = await Promise.all(texts.map(async (url) => (await page.request.get(url)).text()));
          return bodies.some((text) => text.includes("gl_FragColor=vec4("));
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    const bodies = await Promise.all(texts.map(async (url) => (await page.request.get(url)).text()));
    for (const text of bodies) expect(text).not.toMatch(/gl_FragColor = |\n[ \t]+(?:vec[234]|float|uniform|varying) /);
  }
});

// The scene weighs its chunk and every chunk it imports statically that the door did not bring already: a part of three split into a chunk
// of its own is still the scene's (7e: two lazy parts made rolldown split the scene's shared modules out of it).
test("the scene's chunk holds three, and stays within its cap", async ({ page }) => {
  const scene = page.waitForResponse((response) => SCENE.test(response.url()));
  const door = page.waitForResponse((response) => DOOR.test(response.url()));
  await page.goto("/?test-gpu");
  await hydrated(page);
  const url = (await scene).url();
  const brought = new Set(await closureOf(page, (await door).url()));
  const own = (await closureOf(page, url)).filter((each) => !brought.has(each));
  expect(await (await page.request.get(url)).text()).toContain(THREE_MARK);
  expect(await compressed(page, own)).toBeLessThanOrEqual(SCENE_JS);
});

test("the generated worlds' chunk comes with the cosmos's worlds, within its own cap, and no other chunk holds it", async ({
  page,
}) => {
  const chunks = [SCENE, COSMOS, GENERATED].map((chunk) =>
    page.waitForResponse((response) => chunk.test(response.url())),
  );
  await page.goto("/?test-gpu");
  await hydrated(page);
  const [sceneUrl = "", cosmosUrl = "", generatedUrl = ""] = await Promise.all(
    chunks.map(async (response) => (await response).url()),
  );
  expect(await (await page.request.get(generatedUrl)).text()).toContain(GENERATED_MARK);
  for (const url of [sceneUrl, cosmosUrl])
    expect(await (await page.request.get(url)).text()).not.toContain(GENERATED_MARK);
  expect(await compressed(page, [generatedUrl])).toBeLessThanOrEqual(GENERATED_JS);
});
