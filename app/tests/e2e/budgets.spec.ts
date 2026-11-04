import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { closureOf as filesOf, DYNAMIC_IMPORT, HASHED, lateWeights, STATIC_IMPORT } from "./chunks.ts";
import type { Request } from "@playwright/test";
import { cacheContents, controlled, expect, hydrated, isWorld, PAGES, test, type Page } from "./fixtures.ts";
import { BUILD } from "./sites.ts";

// ADR-0001 §12's budgets, as gzip sends them: compressed JavaScript before the first usable screen (the page hydrated), 3 MB in all with
// the worker's precache; their steps in docs/decisions.md. Every cap came down on 2026-11-04 by what its files' hashed names weighed
// before the measure left them out (part 7y), its margin kept: the comments give the values before.
const FIRST_SCREEN_JS = 176_598;
const TOTAL = 3_135_286;

// A text's hashed names of other files weigh as one fixed string (chunks.ts's HASHED); a file that is no text weighs its own bytes.
const compressed = (page: Page, urls: readonly string[]) =>
  page.evaluate(
    async ([list, hashed]) => {
      let total = 0;
      for (const url of list) {
        const response = await fetch(url, { cache: "no-store" });
        const text = /^(?:text\/|application\/(?:javascript|json))/.test(response.headers.get("content-type") ?? "");
        const body = text
          ? new Blob([(await response.text()).replace(new RegExp(hashed, "g"), "-xxxxxxxx.$1")]).stream()
          : response.body;
        if (body !== null)
          total += (await new Response(body.pipeThrough(new CompressionStream("gzip"))).arrayBuffer()).byteLength;
      }
      return total;
    },
    [urls, HASHED.source] as const,
  );

test(
  "a chunk weighs the same whatever hashed names it holds, and a file that is no text its own bytes",
  { tag: "@gate" },
  async ({ page }) => {
    const chunk = (hash: string, type: string) =>
      `data:${type},import"./scene-${hash}.js";import"./cosmos-${hash}.css";url(./font-${hash}.woff2);export const x=1;`;
    for (const type of ["text/javascript", "text/css;charset=utf-8", "application/json"])
      expect(await compressed(page, [chunk("AAAAAAAA", type)]), type).toBe(
        await compressed(page, [chunk("Zq7_x9-K", type)]),
      );
    // Every byte once, most of them no UTF-8: read as text, each would grow to three before gzip.
    const bytes = Array.from({ length: 256 }, (_, i) => (i * 167 + 13) % 256);
    const own = await page.evaluate(
      async (list) =>
        (
          await new Response(
            new Blob([new Uint8Array(list)]).stream().pipeThrough(new CompressionStream("gzip")),
          ).arrayBuffer()
        ).byteLength,
      bytes,
    );
    expect(await compressed(page, [`data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`])).toBe(own);
  },
);

// A page of its own, planted where the site is served: what its entry imports, statically, as it runs and after a fetch, is its first
// screen; what a timer, a frame or an idle callback asks is not, whatever the load, though the page asks it once its clock runs again.
test(
  "the first screen counts what a page imports as it runs, never what its timers ask",
  { tag: "@gate" },
  async ({ page }) => {
    const files: Record<string, string> = {
      "index.html":
        '<!doctype html><link rel="modulepreload" href="/__first/static.js"><script type="module" src="/__first/entry.js"></script>',
      "entry.js": [
        'import "./static.js";',
        'void import("./early.js");',
        'void fetch("/__first/data.json").then(() => import("./fetched.js"));',
        'setTimeout(() => import("./timer.js"), 0);',
        'requestAnimationFrame(() => import("./frame.js"));',
        'requestIdleCallback(() => import("./idle.js"));',
        'const every = setInterval(() => { clearInterval(every); void import("./interval.js"); }, 0);',
        'clearTimeout(setTimeout(() => import("./cleared.js"), 0));',
        'cancelAnimationFrame(requestAnimationFrame(() => import("./cleared.js")));',
        'cancelIdleCallback(requestIdleCallback(() => import("./cleared.js")));',
        "document.__reactContainer$planted = true;",
      ].join("\n"),
      "static.js": "export const at = 1;",
      "early.js": 'import "./part.js";',
      "part.js": "export const at = 2;",
      "data.json": "{}",
      "fetched.js": "export const at = 3;",
      "timer.js": "export const at = 4;",
      "frame.js": "export const at = 5;",
      "idle.js": "export const at = 6;",
      "interval.js": "export const at = 7;",
      "cleared.js": "export const at = 8;",
    };
    const name = (url: string) => new URL(url).pathname.split("/").pop() ?? "";
    await page.route("**/__first/*", (route) => {
      const file = name(route.request().url());
      const type = file.endsWith(".html")
        ? "text/html"
        : file.endsWith(".json")
          ? "application/json"
          : "text/javascript";
      return route.fulfill({ body: files[file] ?? "", contentType: type, status: file in files ? 200 : 404 });
    });
    const seen = watch(page);
    const early = (await firstScreenOf(page, "/__first/index.html", seen)).map(name).sort();
    expect(early).toEqual(["early.js", "entry.js", "fetched.js", "part.js", "static.js"]);
    const later = ["frame.js", "idle.js", "interval.js", "timer.js"];
    await expect
      .poll(() =>
        [...seen.scripts]
          .map(name)
          .filter((file) => later.includes(file))
          .sort(),
      )
      .toEqual(later);
    // A held call cleared before it ran never runs once the rest goes (R5).
    expect([...seen.scripts].map(name)).not.toContain("cleared.js");
    // The guard of every page's run names them: asked, and under no cap.
    expect(
      uncounted(
        seen.scripts,
        early.map((file) => new URL(`/__first/${file}`, page.url()).href),
      ),
    ).toEqual(later);
  },
);

// A world's chat comes after hydration (Chat.tsx's boundary), its lines' view only once a room holds a line
// (RoomView.tsx's): the first screen counts the chat, every run, and never the lines' view (F960, the green pass's G6).
const CHAT = /\/assets\/ChatPanel-[\w-]+\.js$/;
// A page that holds both the chat and the door to space, the Earth's and a world's: its chat waits for the load and the door (useSpace.ts), so
// its chunk leaves the first screen here, by this name alone, and only once the page proves it came after them. The chief's calls, 2026-11-02,
// for Alexis: 7f2's report for the Earth, 7e's for a world.
const DOOR = /\/assets\/mountUniverse-[\w-]+\.js$/;
const holdsDoor = (path: string) => path.endsWith("/earth") || isWorld(path);
// What leaves the first screen keeps a cap of its own, so a chat that grows behind the door is still measured (7e's red pass, 12), with
// what it asks once open: 21,212 B with RoomsDrawer's 762 B and 7y's merge (the chief, 2026-11-04, the margin given ahead); 21,222 B with
// 7v2's one route to a world's page (the margin given ahead).
const LATE_CHAT_JS = 21_222;
const LINES = /\/assets\/Lines-[\w-]+\.js$/;
// A world with a realm reads its proposals from the chain once hydrated (world.tsx, F2977): their chunk is asked after the first
// screen, and the scripts only it needs with it. The first screen counts the scripts the others need, its own cap the rest: first its
// measured 21,265 B and the 256 B margin given ahead (the chief, 2026-11-04).
const PROPOSALS = /\/assets\/Proposals-[\w-]+\.js$/;
const PROPOSALS_JS = 21_521;
// three and the scene: a chunk of their own, asked after the text and never by a phone before View in space. `?test-gpu` lets the
// gate's software GPU through. The mark is a word of three's WebGLRenderer that no minifier renames.
const SCENE = /\/assets\/scene-[\w-]+\.js$/;
// The cosmos, a chunk of its own: only the home that shows worlds asks for it.
const COSMOS = /\/assets\/cosmos-[\w-]+\.js$/;
// A world's page's part of the scene, its own chunk: about 9.4 KB with the maps it shares with the cosmos (7e, 2026-11-02).
// The whole cosmos, past a cluster's distance (7d5): its own chunk, asked once the eye leaves for it.
const WHOLE = /\/assets\/web-[\w-]+\.js$/;
// The view at rest's search and eye (7d6) with the home's dive and dissolve (7d7), and the nebulae (7d6): lazy chunks the home asks once
// its cosmos shows, first capped a tenth or so over their weight (7d7: 6,771 B and 3,492 B). The view at rest's: 10 KiB since 7p's depth,
// 10.5 KiB with 7v's views (Alexis, 2026-11-03, docs/decisions.md).
const REST = /\/assets\/restSearch-[\w-]+\.js$/;
const NEBULAE = /\/assets\/nebulae-[\w-]+\.js$/;
// The cosmos's labels (7h): their own chunk, asked once the cosmos stands, so neither the scene's nor the cosmos's cap pays for them; first
// the part's 5,960 B, 6 KiB once the rail shared their ranking, titles, reading and band (Alexis, 2026-11-03: two chunks of their own, the
// price of sharing), 6.5 KiB with 7v's views, the Plan's loader and its chunk's preloads (Alexis, 2026-11-03).
const LABELS = /\/assets\/labelled-[\w-]+\.js$/;
// The flights (7g): camera-controls, the streaks and the veil, a chunk of their own the scene asks for once it runs, so neither the scene's
// cap nor the cosmos's pays for them. Its first value is the part's: its size at the part's end and about a tenth. The mark is a word of
// camera-controls' own warning, which no minifier renames.
const FLIGHTS = /\/assets\/flights-[\w-]+\.js$/;
const FLIGHTS_MARK = "camera-controls:";
// The rail (7i) and its planets' portraits: chunks of their own, asked once the cosmos's worlds stand on a computer, outside the scene's and
// the cosmos's caps. Their first caps are the part's (the chief, 2026-11-03): 6,408 B and 1,712 B measured, and about a tenth.
const RAIL = /\/assets\/Rail-[\w-]+\.js$/;
const PORTRAITS = /\/assets\/portraits-[\w-]+\.js$/;
const RECORDED_WORLDS = readFileSync(new URL("../../lab/worlds.json", import.meta.url), "utf8");
// A system's arrival (7d3), its dynamic view (7v): a chunk the view at rest's asks the first time a system is, found by name from the scene's
// chunk to the cosmos's to the view at rest's. 1,518 B, then 2 KiB with the dynamic view (Alexis, 2026-11-03); 2,070 B with the Earth's
// views (7x2, the margin given ahead), 8 B of it for other chunks' hashed names.
const COSMOS_NAMED = /\.\/(cosmos-[\w-]+\.js)/;
const REST_NAMED = /\.\/(restSearch-[\w-]+\.js)/;
const ARRIVAL_NAMED = /\.\/(restArrival-[\w-]+\.js)/;
const LABELS_NAMED = /\.\/(labelled-[\w-]+\.js)/;
const ROCKS_NAMED = /\.\/(rocks-[\w-]+\.js)/;
const ROCKS_MARK = "aRock";
// A system's Plan and the Earth's top view (7v, 7x2): a chunk the view at rest's names, weighed apart from the labels' too, whose names'
// code it shares; the Plan's orbits and names, a chunk the labels' name. 2,248 B and 2,147 B (F4470); the orbits' 2,459 B once their
// names' row was shared with the stations' (7x2, the margin given ahead).
const PLAN_NAMED = /\.\/(restPlan-[\w-]+\.js)/;
const ORBITS_NAMED = /\.\/(orbits-[\w-]+\.js)/;
// A system's dynamic view's rocks (7v), laid in a chunk the view at rest's names, drawn by one the labels' name, their program in no
// chunk loaded first (caps in chunks.ts); the depth, the home's far worlds, went with the Earth's view (7x2).
const LAID_NAMED = /\.\/(restRocks-[\w-]+\.js)/;
// The Earth's view (7x2): its stations, scenery, belt, names and caption, a chunk the cosmos's names once it shows (cap in chunks.ts).
const EARTH_VIEW_NAMED = /\.\/(earthView-[\w-]+\.js)/;
const WORLD_PART = /\/assets\/part-[\w-]+\.js$/;
const THREE_MARK = "isWebGLRenderer";
// Every world but the Earth (7b5): its program and its recipe, a chunk of its own the cosmos asks for with its worlds' maps, so neither
// the scene's chunk nor the cosmos's pays for it. The mark is a uniform of its program that no minifier renames.
const GENERATED = /\/assets\/generated-[\w-]+\.js$/;
const GENERATED_MARK = "minorShare";

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

// What a page asks, as the test sees it: each script, every answer but a stream's, the scripts in flight and every request in flight but
// a stream's or a socket's, and how many it asked.
function watch(page: Page) {
  const seen = {
    scripts: new Set<string>(),
    all: new Set<string>(),
    pending: new Set<unknown>(),
    inflight: new Set<unknown>(),
    requests: 0,
  };
  page.on("request", (request) => {
    const kind = request.resourceType();
    if (kind === "eventsource" || kind === "websocket") return;
    seen.requests += 1;
    seen.inflight.add(request);
    if (kind === "script") seen.pending.add(request);
  });
  const ended = (request: Request) => {
    seen.inflight.delete(request);
    seen.pending.delete(request);
  };
  page.on("requestfinished", ended);
  page.on("requestfailed", ended);
  page.on("response", (response) => {
    // A world page's verdicts stream (an EventSource) has no end to count: what the page downloads to run is.
    if (response.request().resourceType() === "eventsource") return;
    seen.all.add(response.url());
    if (response.request().resourceType() === "script") seen.scripts.add(response.url());
  });
  return seen;
}
type Seen = ReturnType<typeof watch>;

// The page's timers, frames and idle callbacks, held from before its first script until the test lets them go: each then runs as asked,
// its delay counted from then, and one cleared meanwhile never runs. The browser's own idle callback stays the test's, which runs only
// when the page has no task left. An init script, it holds each document a page loads.
function holdTimers() {
  const idle = window.requestIdleCallback.bind(window);
  Reflect.set(
    window,
    "__idle",
    () =>
      new Promise<void>((done) =>
        idle(() => {
          done();
        }),
      ),
  );
  const pairs = [
    ["setTimeout", "clearTimeout"],
    ["setInterval", "clearInterval"],
    ["requestAnimationFrame", "cancelAnimationFrame"],
    ["requestIdleCallback", "cancelIdleCallback"],
  ] as const;
  const waiting: (() => void)[] = [];
  const held = new Map<number, number | undefined>(); // a held call's id, and the real one once let go
  let holding = true;
  let last = 0;
  for (const [set, clear] of pairs) {
    const setReal = (window[set] as unknown as (...args: unknown[]) => number).bind(window);
    const clearReal = window[clear].bind(window);
    Reflect.set(window, set, (...args: unknown[]) => {
      if (!holding) return setReal(...args);
      last -= 1;
      const id = last;
      held.set(id, undefined);
      waiting.push(() => {
        if (held.has(id)) held.set(id, setReal(...args));
      });
      return id;
    });
    Reflect.set(window, clear, (id: number) => {
      if (!held.has(id)) {
        clearReal(id);
        return;
      }
      const real = held.get(id);
      held.delete(id);
      if (real !== undefined) clearReal(real);
    });
  }
  Reflect.set(window, "__letTimersGo", () => {
    holding = false;
    for (const go of waiting.splice(0)) go();
  });
}

// Until nothing is in flight and an idle period of the browser's own brings no request, twice: what the page's code asks as it runs,
// mounts or lays out (a fetch's answer, a resize observed) has come, which no load moves; only a timer could ask later.
async function settled(page: Page, seen: Seen): Promise<void> {
  for (let still = 0; still < 2;) {
    await expect.poll(() => seen.inflight.size, { timeout: 60_000 }).toBe(0);
    const before = seen.requests;
    await page.evaluate(() => (Reflect.get(window, "__idle") as () => Promise<void>)());
    still = seen.inflight.size === 0 && seen.requests === before ? still + 1 : 0;
  }
}

// The first screen: what a page asks before any of its timers, frames or idle callbacks runs (the chief, 2026-11-04: a timer's chunk was
// counted at a load of 50 to 80, not quiet), once settled. What it imports as it runs or mounts counts.
async function firstScreenOf(page: Page, path: string, seen: Seen): Promise<string[]> {
  await page.addInitScript(holdTimers);
  await page.goto(path);
  await hydrated(page);
  await settled(page, seen);
  const asked = [...seen.scripts];
  await page.evaluate(() => {
    (Reflect.get(window, "__letTimersGo") as () => void)();
  });
  return asked;
}

// The built files the pages are served from (serve.mjs), which chunks.ts weighs with no page (item 7: a page drawing the scene on a
// software GPU timed these journeys out at a load of 60).
const ASSETS = fileURLToPath(new URL("client/assets/", BUILD));
const fileOfUrl = (url: string) => new URL(url).pathname.split("/").pop() ?? "";

// A script and every script it imports statically, read from the built files, as the page's addresses.
const closureOf = (url: string) => filesOf(ASSETS, fileOfUrl(url)).map((file) => new URL(file, url).href);

// What a late chunk brings: it and every chunk it imports statically that was not there already. A chunk weighed alone would let a split
// carry its code out of every cap (7e's review, B2-1).
const ownOf = (late: string, there: readonly string[]) => closureOf(late).filter((each) => !there.includes(each));

// The scripts a page asked that none of its caps' files holds, by name.
const uncounted = (asked: Iterable<string>, ...caps: readonly (readonly string[])[]) => {
  const counted = new Set(caps.flat());
  return [...asked]
    .filter((url) => !counted.has(url))
    .map(fileOfUrl)
    .sort();
};

// What a late chunk brings once it runs: its own, and each chunk its files name in a dynamic import that the page asked, with that one's
// own, at any depth (the chief, 2026-11-04: the chat's RoomsDrawer, asked once its box is narrow, fell between two cuts).
function openedOf(late: string, there: readonly string[], asked: ReadonlySet<string>): string[] {
  const own = ownOf(late, there);
  // The loop reaches the files pushed as it goes: an array's iterator reads its length at each step.
  for (const file of own) {
    const text = readFileSync(join(ASSETS, fileOfUrl(file)), "utf8");
    for (const [, name = ""] of text.matchAll(new RegExp(DYNAMIC_IMPORT.source, "g"))) {
      const url = new URL(name, late).href;
      if (asked.has(url) && !own.includes(url) && !there.includes(url)) own.push(...ownOf(url, [...there, ...own]));
    }
  }
  return own;
}

// A late chunk the page asked: the very built file chunks.ts weighs by its name, within its cap there.
function weighed(url: string, chunk: string) {
  const weight = lateWeights(ASSETS).find((each) => each.chunk === chunk);
  expect(fileOfUrl(url), `the page's ${chunk} chunk is the built file weighed`).toBe(weight?.file);
  expect(weight?.bytes ?? Infinity, `${chunk}: ${weight?.files.join(", ") ?? "no row"}`).toBeLessThanOrEqual(
    weight?.cap ?? 0,
  );
}

// The address of the late chunk a built file names in its dynamic imports, by `pattern`'s first group.
async function namedIn(page: Page, url: string, pattern: RegExp): Promise<string> {
  const name = pattern.exec(await (await page.request.get(url)).text())?.[1];
  expect(name, `${url} names its late chunk`).toBeDefined();
  return new URL(name ?? "", url).href;
}

// The chat of a page that holds the door, once it holds one: exactly one chunk of that name, named by no preload, and asked after the load and
// the door ended; open, its rooms read and its screen drawn, and settled, so what it asks once open, as a narrow chat's rooms, has come
// (F5410: RoomsDrawer asked as the guard read, at a load of 10 to 40).
async function lateChat(page: Page, path: string, seen: Seen) {
  const { scripts } = seen;
  if (!holdsDoor(path) || (await page.locator("#chat").count()) === 0) return undefined;
  await expect.poll(() => [...scripts].filter((url) => CHAT.test(url)).length).toBe(1);
  await expect(page.locator("#chat [role='status']", { hasText: "Loading the chat" })).toHaveCount(0, {
    timeout: 60_000,
  });
  await settled(page, seen);
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
  test(`${path} stays within its budgets`, { tag: "@gate" }, async ({ page }) => {
    const seen = watch(page);
    const { scripts, all, pending } = seen;
    const world = isWorld(path);
    // The chat's socket answers nothing: no line comes, so nothing asks the lines' view but a fault.
    if (world || holdsDoor(path)) await page.routeWebSocket(/\/ws$/, () => undefined);
    const chat = world ? page.waitForResponse((response) => CHAT.test(response.url())) : undefined;
    // A world page opens its verdicts stream: measured once it has, every run, not as the timing falls.
    const stream = world ? page.waitForResponse((response) => response.url().includes("/api/stream")) : undefined;
    const early = await firstScreenOf(page, path, seen);
    await stream;
    await chat;
    await expect.poll(() => pending.size, "the scripts the chat's code asks for come").toBe(0);
    const asked = [...scripts].filter((url) => PROPOSALS.test(url));
    // Only a world with a realm asks for the proposals' code.
    expect(asked.length > 0, "a world asks for the proposals' code when it has a realm").toBe(path.includes("govdao"));
    const late = [asked[0], await lateChat(page, path, seen)].filter((url) => url !== undefined);
    const firstScreen = await without(page, early, late);
    const lateChunk = late.find((url) => CHAT.test(url));
    const chatOpened = lateChunk === undefined ? [] : openedOf(lateChunk, firstScreen, scripts);
    if (lateChunk !== undefined)
      expect(await compressed(page, chatOpened), "the late chat stays within its cap").toBeLessThanOrEqual(
        LATE_CHAT_JS,
      );
    const proposals = asked[0] === undefined ? [] : openedOf(asked[0], [...firstScreen, ...chatOpened], scripts);
    if (asked[0] !== undefined)
      expect(await compressed(page, proposals), "the proposals stay within their cap").toBeLessThanOrEqual(
        PROPOSALS_JS,
      );
    // Every script the page asked is under one of its caps: a chunk between two cuts fails here (the chief, 2026-11-04).
    expect(uncounted(scripts, firstScreen, chatOpened, proposals), "every chunk the page asks is under a cap").toEqual(
      [],
    );
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
  await page.goto("/?test-gpu");
  await hydrated(page);
  weighed((await cosmos).url(), "cosmos");
});

test("the whole cosmos's chunk stays within its cap, apart from the cosmos's and the scene's", async ({ page }) => {
  const whole = page.waitForResponse((response) => WHOLE.test(response.url()));
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
  weighed((await whole).url(), "web");
});

// The home's scene chunk, once the page hydrated: each late chunk is found by name from it, chunk by chunk.
async function homeScene(page: Page): Promise<string> {
  const asked = page.waitForResponse((response) => SCENE.test(response.url()));
  await page.goto("/?test-gpu");
  await hydrated(page);
  return (await asked).url();
}

// A late chunk the view at rest's names by `named`, found by name from the scene's chunk to the cosmos's to the view at rest's, within its
// cap apart from the chunks its row in chunks.ts names.
async function restLateWithin(page: Page, { named, chunk }: { named: RegExp; chunk: string }): Promise<void> {
  const cosmos = await namedIn(page, await homeScene(page), COSMOS_NAMED);
  const rest = await namedIn(page, cosmos, REST_NAMED);
  weighed(await namedIn(page, rest, named), chunk);
}

// The chunks the labels' names come after: the scene's, the cosmos's and the labels' own.
async function labelsThere(page: Page) {
  const scene = await homeScene(page);
  return { scene, cosmos: await namedIn(page, scene, COSMOS_NAMED), labels: await namedIn(page, scene, LABELS_NAMED) };
}

test("a system's arrival's chunk stays within its cap, apart from the view at rest's, the cosmos's and the scene's", async ({
  page,
}) => {
  await restLateWithin(page, { named: ARRIVAL_NAMED, chunk: "restArrival" });
});

test("a system's view's rocks' laying chunk stays within its cap, apart from the view at rest's, the cosmos's and the scene's", async ({
  page,
}) => {
  await restLateWithin(page, { named: LAID_NAMED, chunk: "restRocks" });
});

test("the Earth's view's chunk stays within its cap, apart from the cosmos's and the scene's", async ({ page }) => {
  const cosmos = await namedIn(page, await homeScene(page), COSMOS_NAMED);
  weighed(await namedIn(page, cosmos, EARTH_VIEW_NAMED), "earthView");
});

test("a Plan's chunk stays within its cap, apart from the view at rest's, the labels', the cosmos's and the scene's", async ({
  page,
}) => {
  await restLateWithin(page, { named: PLAN_NAMED, chunk: "restPlan" });
});

test("the Plan's orbits' chunk stays within its cap, apart from the labels', the cosmos's and the scene's", async ({
  page,
}) => {
  const { labels } = await labelsThere(page);
  weighed(await namedIn(page, labels, ORBITS_NAMED), "orbits");
});

test("the rocks' chunk stays within its cap, apart from the labels', the cosmos's and the scene's, which hold none of it", async ({
  page,
}) => {
  const { scene, cosmos, labels } = await labelsThere(page);
  weighed(await namedIn(page, labels, ROCKS_NAMED), "rocks");
  for (const url of [...closureOf(scene), ...closureOf(cosmos)])
    expect(await (await page.request.get(url)).text(), url).not.toContain(ROCKS_MARK);
});

for (const [name, pattern, chunk] of [
  ["view at rest's", REST, "restSearch"],
  ["nebulae's", NEBULAE, "nebulae"],
  ["labels'", LABELS, "labelled"],
] as const)
  test(`the ${name} chunk stays within its cap, apart from the cosmos's and the scene's`, async ({ page }) => {
    const late = page.waitForResponse((response) => pattern.test(response.url()));
    await page.goto("/?test-gpu");
    await hydrated(page);
    weighed((await late).url(), chunk);
  });

test("the rail's and its portraits' chunks come once the cosmos's worlds stand, each within its own cap, apart from the cosmos's and the scene's", async ({
  page,
}) => {
  await page.route("**/worlds.json", (route) =>
    route.fulfill({ body: RECORDED_WORLDS, contentType: "application/json" }),
  );
  const asked = (chunk: RegExp) => page.waitForResponse((response) => chunk.test(response.url()));
  const [rail, portraits] = [asked(RAIL), asked(PORTRAITS)];
  await page.goto("/?test-gpu");
  await hydrated(page);
  weighed((await rail).url(), "Rail");
  weighed((await portraits).url(), "portraits");
});

test("the flights' chunk holds camera-controls, comes once the scene runs, within its own cap, and the scene's holds none of it", async ({
  page,
}) => {
  const flights = page.waitForResponse((response) => FLIGHTS.test(response.url()));
  const scene = page.waitForResponse((response) => SCENE.test(response.url()));
  await page.goto("/?test-gpu");
  await hydrated(page);
  const [sceneUrl, flightsUrl] = [(await scene).url(), (await flights).url()];
  expect(await (await page.request.get(flightsUrl)).text()).toContain(FLIGHTS_MARK);
  for (const url of closureOf(sceneUrl)) expect(await (await page.request.get(url)).text()).not.toContain(FLIGHTS_MARK);
  weighed(flightsUrl, "flights");
});

test("a world's part of the scene stays within its cap", async ({ page }) => {
  const part = page.waitForResponse((response) => WORLD_PART.test(response.url()));
  await page.goto("/w/bubble?test-gpu");
  await hydrated(page);
  weighed((await part).url(), "part");
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
  await page.goto("/?test-gpu");
  await hydrated(page);
  const url = (await scene).url();
  expect(await (await page.request.get(url)).text()).toContain(THREE_MARK);
  weighed(url, "scene");
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
  weighed(generatedUrl, "generated");
});
