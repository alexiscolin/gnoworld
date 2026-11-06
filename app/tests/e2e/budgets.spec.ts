import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { closureOf as filesOf, DYNAMIC_IMPORT, HASHED, lateWeights, STATIC_IMPORT } from "./chunks.ts";
import type { Request } from "@playwright/test";
import { cacheContents, controlled, expect, hydrated, isWorld, PAGES, test, type Page } from "./fixtures.ts";
import { scriptedErgo } from "./scripted.ts";
import { BUILD } from "./sites.ts";

// ADR-0001 §12's budgets, as gzip sends them, hashed names left out (7y): JavaScript before the first usable screen, 3 MB in all with the
// worker's precache; steps in docs/decisions.md. A plate's page, within the +4 KiB over 183,128 B Alexis gave the plates' pages: the
// Summed on the 8h+8p+8n merge (8n: +63, +3, +13 B for a full Plan's search), weighed on it (the chief, 2026-11-05; each raise in docs/decisions.md).
const FIRST_SCREEN_JS = 187_569;
// A page with no plate (the home, the list) keeps the cap Alexis gave the header (183,296 B), raised by his yeses of 2026-11-05: slice-7
// Summed on the 8h+8p+8n merge (8n: +63, +3, +13 B for a full Plan's search), weighed on it (the chief, 2026-11-05; each raise in docs/decisions.md).
// 189,695 B once slice 9 met slice 8 (the chain's deploys in the ticker, the Earth's room followed, the store's chain and signals), measured on that merge.
const PLAIN_FIRST_SCREEN_JS = 189_695;
const firstScreenCap = (path: string) => (holdsDoor(path) ? FIRST_SCREEN_JS : PLAIN_FIRST_SCREEN_JS);
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
// screen; what a timer, a frame or an idle callback asks is not. Then frames and short timers run, while an idle callback or a timer of
// a second or more waits until the test lets it go, whatever the load (F5410).
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
        'setTimeout(() => import("./second.js"), 1000);',
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
      "second.js": "export const at = 9;",
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
    const asked = (files: readonly string[]) =>
      [...seen.scripts]
        .map(name)
        .filter((file) => files.includes(file))
        .sort();
    const short = ["frame.js", "interval.js", "timer.js"];
    const putOff = ["idle.js", "second.js"];
    await expect.poll(() => asked(short)).toEqual(short);
    await page.waitForTimeout(1500);
    await settled(page, seen);
    expect(asked(putOff), "what the page puts off waits for the test").toEqual([]);
    await letTimersGo(page);
    const later = [...short, ...putOff].sort();
    await expect.poll(() => asked(later)).toEqual(later);
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
// What leaves the first screen keeps a cap of its own, so a chat that grows behind the door is still measured (7e's red pass, 12), with what
// it asks once open: 8d's chat within Alexis's 23 KiB, RoomsDrawer's 768 B (docs/decisions.md, 2026-11-05), 8p's 18 B for the dock's close,
// and 1,060 B for the column's pictures, their manifest, the rail's order and its Credits button (slice-8: 25,167 B).
// 25,880 B once slice 9 met slice 8 (the chain cards, the pinned pills and their wrapping row).
const LATE_CHAT_JS = 25_880;
const LINES = /\/assets\/Lines-[\w-]+\.js$/;
// A world with a realm reads its proposals from the chain once hydrated (world.tsx, F2977): their chunk, asked after the first screen, and
// the scripts only it needs, under a cap of their own: 22,393 B with slice-8's realm page reader (Alexis, 2026-11-05, "oui"; was 21,521 B;
// where the bytes come from: hardening).
const PROPOSALS = /\/assets\/Proposals-[\w-]+\.js$/;
const PROPOSALS_JS = 22_724;
// A world's pinned actions (9e-1, D271), on its plate and in its chat's bar, come in one chunk the proposals' code asks for after hydration, for a
// world that pins one alone: weighed with the proposals.
const PINNED = /\/assets\/Pinned-[\w-]+\.js$/;
// A plate's blocks that wait for a read (8g, Alexis's "Charger avec leur donnée"): the realm card, the hours and their chart, each asked as its
// read starts and capped at its size measured on 2026-11-04 and 256 B (the chief's call). The connected worlds wait for the worlds' file,
// which the journeys' site does not serve: their chunk never loads here.
const PLATE_LATE = /\/assets\/(FromExplorer|hours|Bars)-[\w-]+\.js$/;
const PLATE_LATE_JS: Record<string, number> = { FromExplorer: 6088, hours: 618, Bars: 3336 };
// So does its page's capture on its plate (8f): a chunk of its own, asked after the first screen, capped at its size and 256 B (the chief).
// It is weighed beyond the proposals' code, which the same page loads.
const PREVIEW = /\/assets\/Preview-[\w-]+\.js$/;
// 3,413 B once the realm page's drawing has a chunk of its own (8f's review), capped at its size and 256 B; 5,212 B in the timer-held
// measure on slice-7's merge into slice-8, the realm page's drawing (RealmBlocks) and the chat's (Message) counted here, the capture
// asking for both (Alexis, 2026-11-05, "oui pour l'aperçu à 5 203").
const PREVIEW_JS = 5212;
// Its drawing is the chat's (Message), which its code asks for as it draws: late with it, and weighed with it.
const DRAWING = /\/assets\/Message-[\w-]+\.js$/;
// And the realm page's drawing (5h's RealmBlocks), a chunk of its own through its slot: the capture's three parts.
const PAGE_DRAWING = /\/assets\/RealmBlocks-[\w-]+\.js$/;
const CAPTURE_PARTS = [PREVIEW, DRAWING, PAGE_DRAWING];
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

// A script the page's HTML names: its entry, a route's module, a preload.
const NAMED_SCRIPT = /["'](\/[\w./-]+\.js)["']/;

// The scripts the page's HTML names (at its address) and, at any depth, what they import statically or by a dynamic import the page asked (`asked`), read
// from the built files; never a chunk of `late`, nor what only one opens, though it came before the page settled (F5410: the chat's
// RoomsDrawer, at a load of 100, counted in the first screen as a root of its own).
async function reached(page: Page, asked: readonly string[], late: readonly string[]) {
  const html = await (await page.request.get(page.url())).text();
  const kept = new Set<string>();
  const next = [...html.matchAll(new RegExp(NAMED_SCRIPT.source, "g"))].map(
    ([, name = ""]) => new URL(name, page.url()).href,
  );
  for (let url = next.pop(); url !== undefined; url = next.pop()) {
    if (kept.has(url) || late.includes(url) || !asked.includes(url)) continue;
    kept.add(url);
    const text = readFileSync(join(ASSETS, fileOfUrl(url)), "utf8");
    for (const pattern of [STATIC_IMPORT, DYNAMIC_IMPORT])
      for (const [, name = ""] of text.matchAll(new RegExp(pattern.source, "g"))) next.push(new URL(name, url).href);
  }
  return [...kept];
}

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
  interface Held {
    set: string;
    args: unknown[];
    go: () => void;
  }
  let waiting: Held[] = [];
  const held = new Map<number, number | undefined>(); // a held call's id, and the real one once let go
  let holds: (set: string, args: unknown[]) => boolean = () => true;
  let last = 0;
  for (const [set, clear] of pairs) {
    const setReal = (window[set] as unknown as (...args: unknown[]) => number).bind(window);
    const clearReal = window[clear].bind(window);
    Reflect.set(window, set, (...args: unknown[]) => {
      if (!holds(set, args)) return setReal(...args);
      last -= 1;
      const id = last;
      held.set(id, undefined);
      waiting.push({
        set,
        args,
        go: () => {
          if (held.has(id)) held.set(id, setReal(...args));
        },
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
  const release = (stillHeld: typeof holds) => {
    holds = stillHeld;
    const going = waiting.filter(({ set, args }) => !stillHeld(set, args));
    waiting = waiting.filter(({ set, args }) => stillHeld(set, args));
    for (const { go } of going) go();
  };
  // What a page puts off on purpose waits on: an idle callback, or a timer of a second or more (later.ts, the bell's watch). A frame and
  // a shorter timer run, as React's own that shows a boundary's content once its code came.
  Reflect.set(window, "__letShortGo", () => {
    release((set, args) => set === "requestIdleCallback" || (set.startsWith("set") && Number(args[1] ?? 0) >= 1000));
  });
  Reflect.set(window, "__letTimersGo", () => {
    release(() => false);
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
// counted at a load of 50 to 80, not quiet), once settled. What it imports as it runs or mounts counts. Then what the page puts off on
// purpose stays held until the caller lets it go.
async function firstScreenOf(page: Page, path: string, seen: Seen): Promise<string[]> {
  await page.addInitScript(holdTimers);
  await page.goto(path);
  await hydrated(page);
  await settled(page, seen);
  const asked = [...seen.scripts];
  await page.evaluate(() => {
    (Reflect.get(window, "__letShortGo") as () => void)();
  });
  return asked;
}

const letTimersGo = (page: Page) =>
  page.evaluate(() => {
    (Reflect.get(window, "__letTimersGo") as () => void)();
  });

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

// Each of a plate's late chunks, with what it alone brings, within its own cap; what they bring, for the count of every chunk.
async function plateWithin(page: Page, late: readonly string[], firstScreen: readonly string[]): Promise<string[]> {
  const brought: string[] = [];
  for (const url of late) {
    const name = PLATE_LATE.exec(url)?.[1] ?? "";
    const own = ownOf(url, firstScreen);
    brought.push(...own);
    expect(await compressed(page, own), `the plate's ${name} stays within its cap`).toBeLessThanOrEqual(
      PLATE_LATE_JS[name] ?? 0,
    );
  }
  return brought;
}

// A world's page's capture (8f): its code and the chat's drawing it asks for, both late, on a world with a realm alone (GovDAO, of the default
// universe, whose pages the job captures); none elsewhere.
async function lateCapture(path: string, scripts: ReadonlySet<string>): Promise<string[]> {
  const asks = () => [...scripts].some((url) => PREVIEW.test(url));
  await expect.poll(asks, "a world with a realm asks for its capture's code").toBe(path.includes("govdao"));
  const preview = [...scripts].find((url) => PREVIEW.test(url));
  if (preview === undefined) return [];
  for (const part of [DRAWING, PAGE_DRAWING])
    await expect
      .poll(() => [...scripts].some((url) => part.test(url)), `the capture asks for ${part.source}`)
      .toBe(true);
  return [...scripts].filter((url) => CAPTURE_PARTS.some((part) => part.test(url)));
}

// What the capture brings beyond what the page already holds (`there`: its first screen, the chat's and the proposals' code) stays within
// its cap; what it brings, for the count of every chunk.
async function captureWithin(page: Page, capture: readonly string[], there: readonly string[]): Promise<string[]> {
  const own = [...new Set(capture.flatMap((url) => ownOf(url, there)))];
  if (capture.length > 0)
    expect(await compressed(page, own), "the capture stays within its cap").toBeLessThanOrEqual(PREVIEW_JS);
  return own;
}

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

// The stream handed the signal of a charted world; the plate's line, once it shows.
const chartedStream = async (page: Page, charted: boolean) => {
  if (charted)
    await page.route("**/api/stream?*", (route) =>
      route.fulfill({ contentType: "text/event-stream", body: signalFrame() }),
    );
};
const chartedShown = async (page: Page, charted: boolean) => {
  if (charted) await expect(page.getByText(/^First charted by @g1jg8m/)).toBeVisible();
};
// A world that pins asks for the pinned actions' code once the proposals' code has drawn the plate, after the chat's scripts may all have
// come: measured once it has, not as the timing falls. Only GovDAO pins an action.
const pinnedCodeOf = (page: Page, path: string) =>
  path.includes("govdao") ? page.waitForResponse((response) => PINNED.test(response.url())) : undefined;
const expectPinned = (scripts: ReadonlySet<string>, path: string) => {
  const pinned = [...scripts].filter((url) => PINNED.test(url));
  expect(pinned.length, "a world asks for the pinned actions' code when it pins one").toBe(
    path.includes("govdao") ? 1 : 0,
  );
};

for (const [path, charted] of [...PAGES.map((each) => [each, false] as const), [CHARTED, true] as const]) {
  test(`${path}${charted ? ", charted," : ""} stays within its budgets`, { tag: "@gate" }, async ({ page }) => {
    await chartedStream(page, charted);
    const seen = watch(page);
    const { scripts, all, pending } = seen;
    const world = isWorld(path);
    // The chat's socket answers nothing: no line comes, so nothing asks the lines' view but a fault.
    if (world || holdsDoor(path)) await page.routeWebSocket(/\/ws$/, () => undefined);
    const chat = world ? page.waitForResponse((response) => CHAT.test(response.url())) : undefined;
    // A world page opens its verdicts stream: measured once it has, every run, not as the timing falls.
    const stream = world ? page.waitForResponse((response) => response.url().includes("/api/stream")) : undefined;
    const pinnedCode = pinnedCodeOf(page, path);
    const early = await firstScreenOf(page, path, seen);
    await stream;
    await chat;
    await pinnedCode;
    await chartedShown(page, charted);
    await expect.poll(() => pending.size, "the scripts the chat's code asks for come").toBe(0);
    const asked = [...scripts].filter((url) => PROPOSALS.test(url));
    // Only a world with a realm asks for the proposals' code.
    expect(asked.length > 0, "a world asks for the proposals' code when it has a realm").toBe(path.includes("govdao"));
    expectPinned(scripts, path);
    const chatLate = await lateChat(page, path, seen);
    const capture = await lateCapture(path, scripts);
    // A plate's late chunk landing meanwhile is named late, never weighed as the first screen's.
    const plateLate = [...scripts].filter((url) => PLATE_LATE.test(url));
    const late = [asked[0], ...capture, chatLate, ...plateLate].filter((url) => url !== undefined);
    const firstScreen = await reached(page, early, late);
    const lateChunk = late.find((url) => CHAT.test(url));
    const chatOpened = lateChunk === undefined ? [] : openedOf(lateChunk, firstScreen, scripts);
    if (lateChunk !== undefined)
      expect(await compressed(page, chatOpened), "the late chat stays within its cap").toBeLessThanOrEqual(
        LATE_CHAT_JS,
      );
    // The capture's parts are its own, though the proposals' code names the realm page's drawing too: weighed under the capture's cap.
    const proposals =
      asked[0] === undefined ? [] : openedOf(asked[0], [...firstScreen, ...chatOpened, ...capture], scripts);
    if (asked[0] !== undefined)
      expect(await compressed(page, proposals), "the proposals stay within their cap").toBeLessThanOrEqual(
        PROPOSALS_JS,
      );
    const plates = await plateWithin(page, plateLate, firstScreen);
    const captured = await captureWithin(page, capture, [...firstScreen, ...chatOpened, ...proposals]);
    // Every script the page asked is under one of its caps: a chunk between two cuts fails here (the chief, 2026-11-04). What the page
    // puts off is still held, so what it asks (the bell's watch, the arrival pill) is never the chat's, whatever the load (F5410).
    expect(
      uncounted(scripts, firstScreen, chatOpened, proposals, plates, captured),
      "every chunk the page asks is under a cap",
    ).toEqual([]);
    await letTimersGo(page);
    expect(firstScreen.length, "the page loads no script: the measure is empty").toBeGreaterThan(0);
    expect(
      firstScreen.filter((url) => LINES.test(url)),
      "the lines' view stays behind its boundary",
    ).toEqual([]);
    await controlled(page);
    for (const cached of (await cacheContents(page)).paths) all.add(new URL(cached, page.url()).href);
    expect(await compressed(page, firstScreen)).toBeLessThanOrEqual(firstScreenCap(path));
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

// A page's capture under a chat line (8f), on a world with no realm, whose page loaded none of the realm view's code: what the capture
// brings beyond everything else the page loaded (its first screen, the chat, the lines) stays within the capture's own cap (8f's review, 1).
// 7,445 B: the capture's code, the realm page's reader and drawing, and the warning before a link leaves; capped at its size and 256 B.
// 8,122 B once slice 9 met slice 8 (slice 9's code in the capture).
const LINE_PREVIEW_JS = 8122;
test("a page's capture under a line, on a world with no realm, stays within its cap", async ({ page }) => {
  const scripts = new Set<string>();
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") scripts.add(response.url());
  });
  const text = "how the hub looked last week https://onyx.testnets.gno.land/r/gov/dao";
  const capture = {
    path: "gno.land/r/gov/dao",
    captured: "2026-11-05T10:00:00.000Z",
    text: "# GovDAO\n## Proposals\n",
  };
  await page.route("**/previews.json", (route) =>
    route.fulfill({ json: { version: 1, universe: "onyx", updated: capture.captured, previews: [capture] } }),
  );
  const verdict = { msgid: "p1", room: "#bubble/games", state: "checked" };
  const since = { time: new Date().toISOString() };
  await page.route("**/api/stream?**", (route) =>
    route.fulfill({
      headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
      body: `retry: 100\n\nevent: verdict\ndata: ${JSON.stringify(verdict)}\n\nevent: since\ndata: ${JSON.stringify(since)}\n\n`,
    }),
  );
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, "guest-zzzzzz", { history: [["p1", "2026-11-05T15:32:00.000Z", text]] });
  });
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  await expect(page.locator("button[data-preview]")).toBeVisible({ timeout: 20_000 });
  const parts = [...scripts].filter((url) => CAPTURE_PARTS.some((part) => part.test(url)));
  expect(
    parts.some((url) => PREVIEW.test(url)),
    "the line asks for the capture's code",
  ).toBe(true);
  // What the page's other roots reach (its first screen, the chat, the lines), each with every chunk it imports: a chunk only the capture's
  // parts import is the capture's, one the lines import too (the chat's drawing) is not.
  const roots = await reached(page, [...scripts], parts);
  const there = [...new Set(roots.flatMap(closureOf))];
  const own = parts.map((url) => ownOf(url, there));
  expect(
    await compressed(page, [...new Set(own.flat())]),
    "the line's capture stays within its cap",
  ).toBeLessThanOrEqual(LINE_PREVIEW_JS);
});

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
