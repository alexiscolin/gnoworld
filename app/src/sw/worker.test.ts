import { expect, test, vi } from "vitest";
import {
  cacheName,
  precache,
  release,
  takeOver,
  type LifecycleEvent,
  type Precached,
  type RequestEvent,
  type WorkerCache,
  type WorkerScope,
} from "./worker.ts";

const SITE = "https://gno.world";
// The network serves `build <path>`; each digest was computed apart, with openssl and Python's hashlib.
const PRECACHE: readonly Precached[] = [
  { url: "/", integrity: "sha384-CnCyle5NPLKpxyQYbJa7LCkRCBcbJoQMC4oyDeCxJL6KZ/NY19B7ZxFnQWP7fzrm" },
  { url: "/__spa-fallback.html", integrity: "sha384-UCyKpIWi0ow/XH1myT9UKy1NR3tFLs4REvJ/NT8Gunyx0Lh+nQpd3MNQAlpG3+pj" },
  {
    url: "/assets/entry.client-Bx3f9a1Q.js",
    integrity: "sha384-wCxJ9mRS38niqR1WkOqLCIps+SHWLy3826h9Brfdwa0Wj8hiGz44zwXOMa6RJAmL",
  },
  {
    url: "/assets/root-Dk2l0p9Z.css",
    integrity: "sha384-w9D2omtGrgbOEnFvsYsiOrormQx3OukSZ2noz7qIXEsy6wVLWVPCfZSGnR+mb3gH",
  },
  { url: "/w/bubble", integrity: "sha384-Yeh7J51KsVIXOw059REKt6IrBsuRsas28DfLCC698NP1bjIHdbYhCQoZj0yhaC7Z" },
];
const PATHS = PRECACHE.map(({ url }) => url);
const OWN = PATHS.map((path) => SITE + path);
const [HOME, FALLBACK, ENTRY, CSS, WORLD] = OWN as [string, string, string, string, string];
// A later deploy: its stylesheet has another name. Only the digest of the original is kept, so a body
// the fake serves for it (`edition`) is not one that digest checks: none of these tests re-checks it.
const withCss = (css: string): readonly Precached[] =>
  PRECACHE.map((file) =>
    file.url === "/assets/root-Dk2l0p9Z.css" ? { ...file, url: `/assets/root-${css}.css` } : file,
  );
const NEXT = withCss("Ek2l0p9Z");
const AFTER = withCss("Fk2l0p9Z");

type Stores = Map<string, Map<string, string>>;

// A service worker's global scope with only what the worker uses: caches in memory keyed by the whole URL
// (addAll records each request's digest, which the browser checks, not this fake), a network, the listeners.
// `stores` is the browser's storage: two scopes given the same one are two versions on one site.
function scope({
  failing = false,
  unreadable = false,
  stuck = false,
  vanishing = false,
  offline = false,
  unlisted = false,
  edition = "",
  stores = new Map() as Stores,
} = {}) {
  const listeners = new Map<string, ((event: never) => void)[]>();
  const network: string[] = [];
  const added: { url: string; integrity: string }[] = [];
  const order: string[] = [];
  const store = (name: string) => {
    const urls = stores.get(name) ?? new Map<string, string>();
    stores.set(name, urls);
    return urls;
  };
  const cache = (name: string) =>
    ({
      addAll: (requests: readonly Request[]) => {
        if (failing) return Promise.reject(new Error("404 on one of them"));
        for (const { url, integrity } of requests) {
          const path = new URL(url).pathname;
          added.push({ url: path, integrity });
          store(name).set(url, `build ${edition}${path}`);
        }
        return Promise.resolve();
      },
      keys: () => Promise.resolve([...store(name).keys()].map((url) => new Request(url))),
      match: (request: Request) => {
        const body = vanishing ? undefined : store(name).get(request.url);
        return Promise.resolve(body === undefined ? undefined : new Response(body));
      },
      delete: (request: Request) => Promise.resolve(store(name).delete(request.url)),
    }) satisfies WorkerCache;
  const worker = {
    location: { origin: SITE },
    caches: {
      // Opening a name makes the cache, empty: it is then listed.
      open: (name: string) => {
        store(name);
        return Promise.resolve(cache(name));
      },
      delete: (name: string) => {
        order.push(`delete ${name}`);
        return Promise.resolve(stores.delete(name));
      },
      keys: () =>
        unlisted ? Promise.reject(new Error("cannot list the caches")) : Promise.resolve([...stores.keys()]),
      match: (request: Request, options?: { cacheName?: string }) => {
        if (unreadable) return Promise.reject(new Error("UnknownError: the store cannot be read"));
        const names = options?.cacheName === undefined ? [...stores.keys()] : [options.cacheName];
        for (const name of names) {
          const body = stores.get(name)?.get(request.url);
          if (body !== undefined) return Promise.resolve(new Response(body));
        }
        return Promise.resolve(undefined);
      },
    },
    clients: { claim: vi.fn(() => Promise.resolve()) },
    registration: {
      unregister: vi.fn(() => {
        order.push("unregister");
        return stuck ? Promise.reject(new Error("cannot unregister")) : Promise.resolve(true);
      }),
    },
    skipWaiting: vi.fn(() => Promise.resolve()),
    fetch: (request: Request) => {
      order.push(`fetch ${request.url}`);
      network.push(request.url);
      return offline
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(new Response(`network ${request.url}`));
    },
    addEventListener: (type: string, listener: (event: never) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
  } satisfies WorkerScope;
  // Every listener of the type hears it, as in the browser: one added twice would show.
  const fire = (type: string, event: unknown) => {
    const all = listeners.get(type) ?? [];
    if (all.length === 0) throw new Error(`the worker listens to no ${type}`);
    for (const listener of all) (listener as (event: unknown) => void)(event);
  };
  const held = (name: string) => [...(stores.get(name)?.keys() ?? [])];
  return { worker, stores, store, held, added, network, order, fire };
}

// An install or activate event; the worker must hand the browser the work it waits for.
function lifecycle() {
  const waits: Promise<unknown>[] = [];
  const event: LifecycleEvent = { waitUntil: (promise) => waits.push(promise) };
  const done = async () => {
    expect(waits.length, "the worker gave the browser nothing to wait for").toBeGreaterThan(0);
    await Promise.all(waits);
  };
  return { event, done };
}

// The browser does not let a script build a navigation request, so a test gives one the mode.
function request(url: string, method = "GET", mode = "cors") {
  const answers: Promise<Response>[] = [];
  const made = new Request(url, { method });
  Object.defineProperty(made, "mode", { value: mode });
  const event: RequestEvent = { request: made, respondWith: (response) => answers.push(response) };
  return { event, answer: () => answers[0], answers: () => answers.length };
}
const navigation = (url: string) => request(url, "GET", "navigate");

async function installed(site = scope(), files: readonly Precached[] = PRECACHE) {
  precache(site.worker, files);
  takeOver(site.worker);
  const install = lifecycle();
  site.fire("install", install.event);
  await install.done();
  return { ...site, name: await cacheName(files) };
}

// A version that installed and took over, as it does when its page asks.
async function running(stores: Stores, files: readonly Precached[], edition: string) {
  const site = await installed(scope({ stores, edition }), files);
  const activation = lifecycle();
  site.fire("activate", activation.event);
  await activation.done();
  return site;
}

const precaches = (stores: Stores) => [...stores.keys()].filter((name) => name.startsWith("gnoworld-precache")).sort();
// The caches that hold a version's files, not the one that remembers which version runs.
const versions = (stores: Stores) =>
  precaches(stores).filter((name) => /^gnoworld-precache-[A-Za-z0-9]{16}$/.test(name));
const remembered = (stores: Stores) => precaches(stores).filter((name) => name.startsWith("gnoworld-precache-active-"));

test("install precaches the shell and the hashed files into a cache of this version, each fetched with its digest, and does not take over", async () => {
  const { worker, held, added, name, stores } = await installed();
  expect(added).toEqual(PRECACHE);
  expect(held(name).sort()).toEqual([...OWN].sort());
  expect(precaches(stores)).toEqual([name]);
  expect(name).toMatch(/^gnoworld-precache-[A-Za-z0-9]{16}$/);
  expect(worker.skipWaiting).not.toHaveBeenCalled();
});

test("a version has the cache its list names: the same list, the same cache; another list, another", async () => {
  const stores: Stores = new Map();
  const first = await installed(scope({ stores }));
  const again = await installed(scope({ stores }));
  expect(again.name).toBe(first.name);
  expect(precaches(stores)).toEqual([first.name]);
  const next = await installed(scope({ stores }), NEXT);
  expect(next.name).not.toBe(first.name);
  expect(versions(stores)).toEqual([first.name, next.name].sort());
  // The digest of one file decides it too: the same names with other bytes are another version.
  const changed = PRECACHE.map((file) => (file.url === "/" ? { ...file, integrity: "sha384-other" } : file));
  expect(await cacheName(changed)).not.toBe(first.name);
});

test("install fetches only the files its cache lacks", async () => {
  const stores: Stores = new Map();
  const first = await installed(scope({ stores }));
  first.store(first.name).delete(ENTRY);
  const { added } = await installed(scope({ stores }));
  expect(added).toEqual([PRECACHE[2]]);
});

test("a listed file held with other bytes is dropped at once, and fetched again with its digest", async () => {
  const stores: Stores = new Map();
  const first = await installed(scope({ stores }));
  first.store(first.name).set(ENTRY, "a file someone changed");
  const { store, added, name } = await installed(scope({ stores }));
  expect(added).toEqual([PRECACHE[2]]);
  expect(store(name).get(ENTRY)).toBe("build /assets/entry.client-Bx3f9a1Q.js");
});

test("a file gone between the cache's list and its read is fetched again", async () => {
  const stores: Stores = new Map();
  await installed(scope({ stores }));
  const { added } = await installed(scope({ stores, vanishing: true }));
  expect(added).toEqual(PRECACHE);
});

test("a file held with other bytes is not kept even when the install fails", async () => {
  const stores: Stores = new Map();
  const first = await installed(scope({ stores }));
  first.store(first.name).set(ENTRY, "a file someone changed");
  const site = scope({ stores, failing: true });
  precache(site.worker, PRECACHE);
  const install = lifecycle();
  site.fire("install", install.event);
  await expect(install.done()).rejects.toThrow("404 on one of them");
  expect(site.held(first.name)).not.toContain(ENTRY);
});

test("an install that cannot fetch a file fails, so the version before stays: its files, its record, its answers", async () => {
  const stores: Stores = new Map();
  const a = await running(stores, PRECACHE, "A ");
  const before = new Map([...stores].map(([name, urls]) => [name, [...urls]]));
  const site = scope({ stores, failing: true });
  precache(site.worker, NEXT);
  const install = lifecycle();
  site.fire("install", install.event);
  await expect(install.done()).rejects.toThrow("404 on one of them");
  // Only the empty cache the failed version opened is new; a failed version never reaches the record.
  expect(versions(stores).filter((name) => name !== a.name)).toHaveLength(1);
  for (const [name, urls] of before) expect([...(stores.get(name) ?? [])]).toEqual(urls);
  const { event, answer } = navigation(HOME);
  a.fire("fetch", event);
  expect(await (await answer())?.text()).toBe("build A /");
});

test("a store that cannot be listed fails the activation, and nothing is deleted", async () => {
  const stores: Stores = new Map();
  await running(stores, PRECACHE, "A ");
  const kept = [...stores.keys()];
  const site = await installed(scope({ stores, edition: "B " }), NEXT);
  const failing = scope({ stores, unlisted: true });
  precache(failing.worker, NEXT);
  const activation = lifecycle();
  failing.fire("activate", activation.event);
  await expect(activation.done()).rejects.toThrow("cannot list the caches");
  expect([...stores.keys()]).toEqual([...kept, site.name]);
});

test("a version that comes back after the one that replaced it keeps that one, as the version before", async () => {
  const stores: Stores = new Map();
  const a = await running(stores, PRECACHE, "A ");
  const b = await running(stores, NEXT, "B ");
  await running(stores, PRECACHE, "A ");
  expect(versions(stores)).toEqual([a.name, b.name].sort());
});

test("activate takes the open pages, drops the older layout's cache, and leaves every other cache", async () => {
  const stores: Stores = new Map();
  stores.set("gnoworld-precache", new Map([[`${SITE}/assets/entry.client-AAAAAAAA.js`, ""]]));
  stores.set("gnoworld-history", new Map([[`${SITE}/assets/entry.client-AAAAAAAA.js`, ""]]));
  stores.set("somebody-else", new Map());
  const { worker, name } = await running(stores, PRECACHE, "");
  expect(versions(stores)).toEqual([name]);
  expect(stores.has("gnoworld-precache")).toBe(false);
  expect(remembered(stores)).toHaveLength(1);
  expect([...stores.keys()]).toContain("gnoworld-history");
  expect([...stores.keys()]).toContain("somebody-else");
  expect(worker.clients.claim).toHaveBeenCalledOnce();
});

// F172: a tab still on the version before keeps working until the next update.
test("the version before is kept when the next takes over, and the one before that is dropped", async () => {
  const stores: Stores = new Map();
  const a = await running(stores, PRECACHE, "A ");
  const b = await running(stores, NEXT, "B ");
  expect(versions(stores)).toEqual([a.name, b.name].sort());
  const c = await running(stores, AFTER, "C ");
  expect(versions(stores)).toEqual([b.name, c.name].sort());
});

test("a version installed and replaced before it took over is dropped; the one in use stays", async () => {
  const stores: Stores = new Map();
  const a = await running(stores, PRECACHE, "A ");
  const b = await installed(scope({ stores, edition: "B " }), NEXT);
  const c = await running(stores, AFTER, "C ");
  const kept = versions(stores);
  expect(kept).toEqual([a.name, c.name].sort());
  expect(kept).not.toContain(b.name);
});

test("a cache opened and left empty is a cache: Cache Storage lists it", async () => {
  const site = scope();
  await site.worker.caches.open("gnoworld-precache-active-x");
  expect(await site.worker.caches.keys()).toEqual(["gnoworld-precache-active-x"]);
});

test("the record of what runs is one cache, however many versions took over", async () => {
  const stores: Stores = new Map();
  await running(stores, PRECACHE, "A ");
  await running(stores, NEXT, "B ");
  await running(stores, AFTER, "C ");
  expect(remembered(stores)).toHaveLength(1);
});

test("the same version taking over again keeps the version before it", async () => {
  const stores: Stores = new Map();
  const a = await running(stores, PRECACHE, "A ");
  const b = await running(stores, NEXT, "B ");
  await running(stores, NEXT, "B ");
  expect(versions(stores)).toEqual([a.name, b.name].sort());
});

test("a record nobody can read is as no record: the version takes over, and drops what it does not know", async () => {
  const stores: Stores = new Map();
  const a = await running(stores, PRECACHE, "A ");
  for (const name of remembered(stores)) stores.delete(name);
  stores.set("gnoworld-precache-active-garbage", new Map());
  const b = await running(stores, NEXT, "B ");
  expect(versions(stores)).toEqual([b.name]);
  expect(stores.has(a.name)).toBe(false);
  expect(stores.has("gnoworld-precache-active-garbage")).toBe(false);
  expect(remembered(stores)).toHaveLength(1);
});

test("a shell file is answered from the cache: a page, its fallback, a script", async () => {
  const site = await installed();
  for (const [url, path] of [
    [HOME, "/"],
    [WORLD, "/w/bubble"],
    [FALLBACK, "/__spa-fallback.html"],
    [ENTRY, "/assets/entry.client-Bx3f9a1Q.js"],
  ] as const) {
    const { event, answer } = request(url);
    site.fire("fetch", event);
    expect(await (await answer())?.text(), url).toBe(`build ${path}`);
  }
  expect(site.network).toEqual([]);
});

// F175: the version running answers a new tab with its own page, whatever waits to take over.
test("a page opened while a newer version waits is the running version's, not the newer one's", async () => {
  const stores: Stores = new Map();
  const running_ = await running(stores, PRECACHE, "A ");
  await installed(scope({ stores, edition: "B " }), NEXT);
  const { event, answer } = navigation(HOME);
  running_.fire("fetch", event);
  expect(await (await answer())?.text()).toBe("build A /");
  expect(running_.network).toEqual([]);
});

test("a version answers a page from its own cache even when an older cache holds the same address", async () => {
  const stores: Stores = new Map();
  await running(stores, PRECACHE, "A ");
  const b = await running(stores, NEXT, "B ");
  for (const { event, answer } of [navigation(HOME), request(ENTRY)]) {
    b.fire("fetch", event);
    expect(await (await answer())?.text()).toMatch(/^build B /);
  }
});

test("a page is found by its path alone: a query or a fragment-less variant still opens the cached page", async () => {
  const site = await installed();
  const { event, answer } = navigation(`${WORLD}?utm_source=mail`);
  site.fire("fetch", event);
  expect(await (await answer())?.text()).toBe("build /w/bubble");
  expect(site.network).toEqual([]);
});

// F172: the file only the version before lists is still in the cache, though the host dropped it.
test("a file only the version before listed is answered from its cache after the next took over, not asked of the host", async () => {
  const stores: Stores = new Map();
  await running(stores, PRECACHE, "A ");
  const b = await running(stores, NEXT, "B ");
  const { event, answer } = request(CSS);
  b.fire("fetch", event);
  expect(await (await answer())?.text()).toBe("build A /assets/root-Dk2l0p9Z.css");
  expect(b.network).toEqual([]);
});

test("two versions on, the first one's file comes from the host again: nothing keeps it", async () => {
  const stores: Stores = new Map();
  await running(stores, PRECACHE, "A ");
  await running(stores, NEXT, "B ");
  const c = await running(stores, AFTER, "C ");
  const { event, answer } = request(CSS);
  c.fire("fetch", event);
  expect(await (await answer())?.text()).toBe(`network ${CSS}`);
});

test("a hashed file no cache holds comes from the network, and is not cached then", async () => {
  const site = scope();
  precache(site.worker, PRECACHE);
  const url = `${SITE}/assets/other-AAAAAAAA.js`;
  const { event, answer } = request(url);
  site.fire("fetch", event);
  expect(await (await answer())?.text()).toBe(`network ${url}`);
  expect(site.network).toEqual([url]);
  expect(site.stores.size).toBe(0);
});

test("a cache that is not the worker's never answers: its copy of a hashed file is passed over", async () => {
  const stores: Stores = new Map();
  const url = `${SITE}/assets/other-AAAAAAAA.js`;
  stores.set("gnoworld-history", new Map([[url, "planted"]]));
  stores.set("somebody-else", new Map([[url, "planted"]]));
  const site = await running(stores, PRECACHE, "");
  const { event, answer } = request(url);
  site.fire("fetch", event);
  expect(await (await answer())?.text()).toBe(`network ${url}`);
});

// Only a hashed name is the content's: the worker answers no other file of the build's own folder.
test("a name that is not a whole hashed name is left to the host: a short hash, a map, a nested path, another kind", () => {
  const { worker, fire } = scope();
  precache(worker, PRECACHE);
  for (const path of [
    "/assets/other-AAAAAAA.js",
    "/assets/other-AAAAAAAA.js.map",
    "/assets/other-AAAAAAAA.txt",
    "/assets/sub/other-AAAAAAAA.js",
    "/x/assets/other-AAAAAAAA.js",
    "/other-AAAAAAAA.js",
    "/assets/other-AAAAAAAAA.js.js.gz",
  ]) {
    const { event, answers } = request(`${SITE}${path}`);
    fire("fetch", event);
    expect(answers(), path).toBe(0);
  }
});

test("a listed file missing from the cache comes from the network, and is not cached then", async () => {
  const site = scope();
  precache(site.worker, PRECACHE);
  const { event, answer } = request(CSS);
  site.fire("fetch", event);
  expect(await (await answer())?.text()).toBe(`network ${CSS}`);
  expect(site.network).toEqual([CSS]);
  expect(site.stores.size).toBe(0);
});

test("a cache that cannot be read is passed over: the file and the page come from the network", async () => {
  const site = scope({ unreadable: true });
  precache(site.worker, PRECACHE);
  for (const { event, answer } of [request(ENTRY), navigation(HOME)]) {
    site.fire("fetch", event);
    expect(await (await answer())?.text()).toMatch(/^network /);
  }
  expect(site.network).toEqual([ENTRY, HOME]);
});

test("a page the build never made comes from the host, and is not cached then", async () => {
  const site = await installed();
  const url = `${SITE}/nowhere`;
  const { event, answer } = navigation(url);
  site.fire("fetch", event);
  expect(await (await answer())?.text()).toBe(`network ${url}`);
  expect(site.held(site.name).sort()).toEqual([...OWN].sort());
});

test("with no network, a page the build never made opens the shell, whose router shows its own not found", async () => {
  const stores: Stores = new Map();
  await running(stores, PRECACHE, "");
  const down = scope({ stores, offline: true });
  precache(down.worker, PRECACHE);
  const url = `${SITE}/nowhere`;
  const { event, answer } = navigation(url);
  down.fire("fetch", event);
  expect(await (await answer())?.text()).toBe("build /__spa-fallback.html");
  expect(down.network).toEqual([url]);
});

test("with no network and no shell in the cache, the page fails as the browser's own would", async () => {
  const down = scope({ offline: true });
  precache(down.worker, PRECACHE);
  const { event, answer } = navigation(`${SITE}/nowhere`);
  down.fire("fetch", event);
  await expect(answer()).rejects.toThrow("Failed to fetch");
});

test("with no network, a hashed file no cache holds fails; the shell is for pages only", async () => {
  const stores: Stores = new Map();
  await running(stores, PRECACHE, "");
  const down = scope({ stores, offline: true });
  precache(down.worker, PRECACHE);
  const { event, answer } = request(`${SITE}/assets/other-AAAAAAAA.js`);
  down.fire("fetch", event);
  await expect(answer()).rejects.toThrow("Failed to fetch");
});

// A path is the page's identity: case, a trailing slash and another origin each name something else.
test("a page asked by another spelling is the host's to answer; another origin's is not the worker's at all", async () => {
  const site = await installed();
  for (const path of ["/W/bubble", "/w/bubble/", "/index.html", "/w//bubble"]) {
    const { event, answer } = navigation(`${SITE}${path}`);
    site.fire("fetch", event);
    expect(await (await answer())?.text(), path).toBe(`network ${SITE}${path}`);
  }
  for (const url of ["http://gno.world/", "https://gno.world:8443/", "https://sub.example.org/w/bubble"]) {
    const { event, answers } = navigation(url);
    site.fire("fetch", event);
    expect(answers(), url).toBe(0);
  }
});

test("nothing else is answered: another site, any method but GET, an unlisted file or query, a data file", () => {
  const { worker, fire } = scope();
  precache(worker, PRECACHE);
  for (const [url, method, mode] of [
    [`https://rpc.gno.land${PATHS[2] ?? ""}`, "GET", "cors"],
    [`https://rpc.gno.land/`, "GET", "navigate"],
    [HOME, "POST", "cors"],
    [HOME, "PUT", "cors"],
    [ENTRY, "DELETE", "cors"],
    [ENTRY, "HEAD", "cors"],
    [WORLD, "POST", "navigate"],
    [`${SITE}/api/rooms`, "GET", "cors"],
    [`${SITE}/w/bubble.data`, "GET", "cors"],
    [`${ENTRY}?v=2`, "GET", "cors"],
    [`${SITE}/assets/readme.txt`, "GET", "cors"],
  ] as const) {
    const { event, answers } = request(url, method, mode);
    fire("fetch", event);
    expect(answers(), `${method} ${url}`).toBe(0);
  }
});

test("the open page asks it to take over with SKIP_WAITING; any other message does nothing", async () => {
  const { worker, fire } = scope();
  takeOver(worker);
  for (const data of [null, undefined, "SKIP_WAITING", { type: "OTHER" }, { kind: "SKIP_WAITING" }]) {
    fire("message", { data, waitUntil: () => undefined });
  }
  expect(worker.skipWaiting).not.toHaveBeenCalled();
  const { event, done } = lifecycle();
  fire("message", { ...event, data: { type: "SKIP_WAITING" } });
  await done();
  expect(worker.skipWaiting).toHaveBeenCalledOnce();
});

test("?nosw on a request: the worker drops every cache of its own, unregisters, then the host answers", async () => {
  const stores: Stores = new Map();
  await running(stores, PRECACHE, "A ");
  const site = await running(stores, NEXT, "B ");
  stores.set("gnoworld-history", new Map());
  stores.set("gnoworld-precache", new Map());
  expect(precaches(stores).length, "the caches there are to drop").toBeGreaterThan(3);
  release(site.worker);
  site.order.length = 0;
  const { event, answer } = request(`${SITE}/w/bubble?nosw`);
  site.fire("fetch", event);
  expect(await (await answer())?.text()).toBe(`network ${SITE}/w/bubble?nosw`);
  expect([...stores.keys()]).toEqual(["gnoworld-history"]);
  expect(site.order.at(-2)).toBe("unregister");
  expect(site.order.at(-1)).toBe(`fetch ${SITE}/w/bubble?nosw`);
  expect(site.order.slice(0, -2).every((step) => step.startsWith("delete gnoworld-precache"))).toBe(true);
});

test("?nosw is answered once, by its own rule, though the page's file is cached", async () => {
  const stores: Stores = new Map();
  const site = await installed(scope({ stores }));
  release(site.worker);
  for (const url of [`${HOME}?nosw`, `${WORLD}?nosw`]) {
    const { event, answer, answers } = navigation(url);
    site.fire("fetch", event);
    expect(answers(), url).toBe(1);
    expect(await (await answer())?.text(), url).toBe(`network ${url}`);
  }
  expect(precaches(stores)).toEqual([]);
  expect(site.worker.registration.unregister).toHaveBeenCalled();
});

// A request from another site, or one that is no GET, is not the visitor's own way out.
test("?nosw leaves the worker alone when the request comes from another site or is no GET", async () => {
  const stores: Stores = new Map();
  const site = await installed(scope({ stores }));
  release(site.worker);
  for (const [url, method] of [
    ["https://evil.test/pixel.png?nosw", "GET"],
    [`${SITE}/api/x?nosw`, "POST"],
    [`${HOME}?nosw`, "HEAD"],
  ] as const) {
    const { event, answers } = request(url, method);
    site.fire("fetch", event);
    expect(answers(), `${method} ${url}`).toBe(0);
  }
  expect(precaches(stores)).toEqual([site.name]);
  expect(site.worker.registration.unregister).not.toHaveBeenCalled();
});

test("?nosw is still answered by the host when the worker cannot leave", async () => {
  const { worker, fire } = scope({ stuck: true });
  release(worker);
  const { event, answer } = request(`${SITE}/?nosw`);
  fire("fetch", event);
  expect(await (await answer())?.text()).toBe(`network ${SITE}/?nosw`);
});

test("without ?nosw, the worker stays: another parameter, a listed file, a page", () => {
  const { worker, fire } = scope();
  release(worker);
  for (const url of [`${SITE}/?nosweat`, `${SITE}/?q=nosw`, ENTRY, `${SITE}/`]) {
    const { event, answers } = request(url);
    fire("fetch", event);
    expect(answers(), url).toBe(0);
  }
  expect(worker.registration.unregister).not.toHaveBeenCalled();
});
