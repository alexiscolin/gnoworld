import { expect, test, vi } from "vitest";
import {
  precache,
  takeOver,
  type LifecycleEvent,
  type Precached,
  type RequestEvent,
  type WorkerCache,
  type WorkerScope,
} from "./worker.ts";

const SITE = "https://gno.world";
// The network serves `build <path>`; each digest was computed apart, with Python's hashlib.
const PRECACHE: readonly Precached[] = [
  {
    url: "/assets/entry.client-Bx3f9a1Q.js",
    integrity: "sha384-wCxJ9mRS38niqR1WkOqLCIps+SHWLy3826h9Brfdwa0Wj8hiGz44zwXOMa6RJAmL",
  },
  {
    url: "/assets/root-Dk2l0p9Z.css",
    integrity: "sha384-w9D2omtGrgbOEnFvsYsiOrormQx3OukSZ2noz7qIXEsy6wVLWVPCfZSGnR+mb3gH",
  },
];
const PATHS = PRECACHE.map(({ url }) => url);
const OWN = PATHS.map((path) => SITE + path);

// A service worker's global scope with nothing but what the worker uses: caches in memory, keyed
// by the whole URL (a put records, so a worker caching what it fetches shows; addAll records each
// request's digest, which the browser checks, not this fake), a network, the listeners added.
function scope({ failing = false, unreadable = false } = {}) {
  const stores = new Map<string, Map<string, string>>();
  const listeners = new Map<string, ((event: never) => void)[]>();
  const network: string[] = [];
  const added: { url: string; integrity: string }[] = [];
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
          store(name).set(url, `build ${path}`);
        }
        return Promise.resolve();
      },
      keys: () => Promise.resolve([...store(name).keys()].map((url) => new Request(url))),
      match: (request: Request) => {
        const body = store(name).get(request.url);
        return Promise.resolve(body === undefined ? undefined : new Response(body));
      },
      delete: (request: Request) => Promise.resolve(store(name).delete(request.url)),
      put: (request: Request) => {
        store(name).set(request.url, "put");
        return Promise.resolve();
      },
    }) satisfies WorkerCache & { put(request: Request): Promise<void> };
  const worker = {
    location: { origin: SITE },
    caches: {
      open: (name: string) => Promise.resolve(cache(name)),
      match: (request: Request, { cacheName }: { cacheName: string }) => {
        if (unreadable) return Promise.reject(new Error("UnknownError: the store cannot be read"));
        const body = stores.get(cacheName)?.get(request.url);
        return Promise.resolve(body === undefined ? undefined : new Response(body));
      },
    },
    clients: { claim: vi.fn(() => Promise.resolve()) },
    skipWaiting: vi.fn(() => Promise.resolve()),
    fetch: (request: Request) => {
      network.push(request.url);
      return Promise.resolve(new Response(`network ${request.url}`));
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
  const held = (name = "gnoworld-precache") => [...(stores.get(name)?.keys() ?? [])];
  return { worker, store, held, added, network, fire };
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

function request(url: string, method = "GET") {
  let answer: Promise<Response> | undefined;
  const event: RequestEvent = {
    request: new Request(url, { method }),
    respondWith: (response) => {
      answer = response;
    },
  };
  return { event, answer: () => answer };
}

function installed(site = scope()) {
  precache(site.worker, PRECACHE);
  const install = lifecycle();
  site.fire("install", install.event);
  return { ...site, install };
}

test("install precaches every listed file, each fetched with the digest its bytes must have, and does not take over", async () => {
  const { worker, held, added, install } = installed();
  await install.done();
  expect(added).toEqual(PRECACHE);
  expect(held()).toEqual(OWN);
  expect(worker.skipWaiting).not.toHaveBeenCalled();
});

test("install fetches only the files the cache lacks, and keeps the older version's until it takes over", async () => {
  const site = scope();
  const older = `${SITE}/assets/entry.client-AAAAAAAA.js`;
  site.store("gnoworld-precache").set(older, "an older version's");
  site.store("gnoworld-precache").set(OWN[1] ?? "", `build ${PATHS[1] ?? ""}`);
  const { held, added, install } = installed(site);
  await install.done();
  expect(added).toEqual([PRECACHE[0]]);
  expect(held().sort()).toEqual([older, ...OWN].sort());
});

test("a listed file held with other bytes is dropped at once, and fetched again with its digest", async () => {
  const site = scope();
  site.store("gnoworld-precache").set(OWN[0] ?? "", "a file someone changed");
  site.store("gnoworld-precache").set(OWN[1] ?? "", `build ${PATHS[1] ?? ""}`);
  const { store, added, install } = installed(site);
  await install.done();
  expect(added).toEqual([PRECACHE[0]]);
  expect(store("gnoworld-precache").get(OWN[0] ?? "")).toBe(`build ${PATHS[0] ?? ""}`);
});

test("a file held with other bytes is not kept even when the install fails", async () => {
  const site = scope({ failing: true });
  site.store("gnoworld-precache").set(OWN[0] ?? "", "a file someone changed");
  const { held, install } = installed(site);
  await expect(install.done()).rejects.toThrow("404 on one of them");
  expect(held()).toEqual([]);
});

test("an install that cannot fetch a file fails, so the version before stays", async () => {
  const { install } = installed(scope({ failing: true }));
  await expect(install.done()).rejects.toThrow("404 on one of them");
});

test("activate drops the files this version does not list, leaves any other cache, and takes the open pages", async () => {
  const { worker, store, held, fire } = scope();
  for (const url of [`${SITE}/assets/entry.client-AAAAAAAA.js`, ...OWN]) store("gnoworld-precache").set(url, "");
  store("gnoworld-history").set(`${SITE}/assets/entry.client-AAAAAAAA.js`, "");
  precache(worker, PRECACHE);
  takeOver(worker);
  const { event, done } = lifecycle();
  fire("activate", event);
  await done();
  expect(held()).toEqual(OWN);
  expect(held("gnoworld-history")).toEqual([`${SITE}/assets/entry.client-AAAAAAAA.js`]);
  expect(worker.clients.claim).toHaveBeenCalledOnce();
});

test("a precached file is answered from the cache", async () => {
  const { network, fire, install } = installed();
  await install.done();
  const { event, answer } = request(OWN[0] ?? "");
  fire("fetch", event);
  expect(await (await answer())?.text()).toBe(`build ${PATHS[0] ?? ""}`);
  expect(network).toEqual([]);
});

test("a precached file missing from the cache comes from the network, and is not cached then", async () => {
  const { worker, held, network, fire } = scope();
  precache(worker, PRECACHE);
  const url = OWN[1] ?? "";
  const { event, answer } = request(url);
  fire("fetch", event);
  expect(await (await answer())?.text()).toBe(`network ${url}`);
  expect(network).toEqual([url]);
  expect(held()).toEqual([]);
});

test("a cache that cannot be read is passed over: the file comes from the network", async () => {
  const { worker, network, fire } = scope({ unreadable: true });
  precache(worker, PRECACHE);
  const url = OWN[0] ?? "";
  const { event, answer } = request(url);
  fire("fetch", event);
  expect(await (await answer())?.text()).toBe(`network ${url}`);
  expect(network).toEqual([url]);
});

test("nothing else is answered: a page, its data, another file or query, another site, any method but GET", () => {
  const { worker, fire } = scope();
  precache(worker, PRECACHE);
  const own = OWN[0] ?? "";
  for (const [url, method] of [
    [`${SITE}/`, "GET"],
    [`${SITE}/w/bubble.data`, "GET"],
    [`${SITE}/assets/other-AAAAAAAA.js`, "GET"],
    [`${own}?v=2`, "GET"],
    [`https://rpc.gno.land${PATHS[0] ?? ""}`, "GET"],
    [own, "POST"],
    [own, "PUT"],
    [own, "DELETE"],
    [own, "HEAD"],
  ] as const) {
    const { event, answer } = request(url, method);
    fire("fetch", event);
    expect(answer(), `${method} ${url}`).toBeUndefined();
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
