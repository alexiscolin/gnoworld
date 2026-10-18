import { expect, test, vi } from "vitest";
import { listen, type LifecycleEvent, type RequestEvent, type WorkerCache, type WorkerScope } from "./worker.ts";

const PRECACHE = ["/assets/entry.client-Bx3f9a1Q.js", "/assets/root-Dk2l0p9Z.css"];

// A service worker's global scope with nothing but what the worker uses: caches in memory (with
// a put that records, so a worker that caches what it fetches is seen), a network that records
// what it was asked, and the listeners the worker adds.
function scope({ failing = false } = {}) {
  const stores = new Map<string, Map<string, string>>();
  const listeners = new Map<string, (event: never) => void>();
  const network: string[] = [];
  const cache = (name: string) => {
    const store = stores.get(name) ?? new Map<string, string>();
    stores.set(name, store);
    return {
      addAll: (urls: readonly string[]) => {
        if (failing) return Promise.reject(new Error("404 on one of them"));
        for (const url of urls) store.set(url, `cached ${url}`);
        return Promise.resolve();
      },
      match: (request: Request) => {
        const body = store.get(new URL(request.url).pathname);
        return Promise.resolve(body === undefined ? undefined : new Response(body));
      },
      put: (request: Request) => {
        store.set(new URL(request.url).pathname, "put");
        return Promise.resolve();
      },
    } satisfies WorkerCache & { put(request: Request): Promise<void> };
  };
  const worker = {
    location: { origin: "https://gno.world" },
    caches: {
      open: (name: string) => Promise.resolve(cache(name)),
      keys: () => Promise.resolve([...stores.keys()]),
      delete: (name: string) => Promise.resolve(stores.delete(name)),
    },
    clients: { claim: vi.fn(() => Promise.resolve()) },
    skipWaiting: vi.fn(() => Promise.resolve()),
    fetch: (request: Request) => {
      network.push(request.url);
      return Promise.resolve(new Response(`network ${request.url}`));
    },
    addEventListener: (type: string, listener: (event: never) => void) => {
      listeners.set(type, listener);
    },
  } satisfies WorkerScope;
  const fire = (type: string, event: unknown) => {
    const listener = listeners.get(type);
    if (listener === undefined) throw new Error(`the worker listens to no ${type}`);
    (listener as (event: unknown) => void)(event);
  };
  return { worker, stores, network, fire };
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

function installed(failing = false) {
  const site = scope({ failing });
  listen(site.worker, PRECACHE, "v2");
  const install = lifecycle();
  site.fire("install", install.event);
  return { ...site, install };
}

test("install precaches every listed file in this version's cache, and does not take over", async () => {
  const { worker, stores, install } = installed();
  await install.done();
  expect([...(stores.get("gnoworld-v2")?.keys() ?? [])]).toEqual(PRECACHE);
  expect(worker.skipWaiting).not.toHaveBeenCalled();
});

test("an install that cannot fetch a file fails, so the version before stays", async () => {
  const { install } = installed(true);
  await expect(install.done()).rejects.toThrow("404 on one of them");
});

test("activate deletes this site's caches of other versions, keeps any other, and takes the open pages", async () => {
  const { worker, stores, fire } = scope();
  for (const name of ["gnoworld-v1", "gnoworld-v2", "other-cache"]) await worker.caches.open(name);
  listen(worker, PRECACHE, "v2");
  const { event, done } = lifecycle();
  fire("activate", event);
  await done();
  expect([...stores.keys()]).toEqual(["gnoworld-v2", "other-cache"]);
  expect(worker.clients.claim).toHaveBeenCalledOnce();
});

test("a precached file is answered from the cache", async () => {
  const { network, fire, install } = installed();
  await install.done();
  const { event, answer } = request(`https://gno.world${PRECACHE[0] ?? ""}`);
  fire("fetch", event);
  expect(await (await answer())?.text()).toBe(`cached ${PRECACHE[0] ?? ""}`);
  expect(network).toEqual([]);
});

test("a precached file missing from the cache comes from the network, and is not cached then", async () => {
  const { worker, stores, network, fire } = scope();
  listen(worker, PRECACHE, "v2");
  await worker.caches.open("gnoworld-v2");
  const url = `https://gno.world${PRECACHE[1] ?? ""}`;
  const { event, answer } = request(url);
  fire("fetch", event);
  expect(await (await answer())?.text()).toBe(`network ${url}`);
  expect(network).toEqual([url]);
  expect([...(stores.get("gnoworld-v2")?.keys() ?? [])]).toEqual([]);
});

test("nothing else is answered: a page, its data, another file, another site, any method but GET", () => {
  const { worker, fire } = scope();
  listen(worker, PRECACHE, "v2");
  const own = `https://gno.world${PRECACHE[0] ?? ""}`;
  for (const [url, method] of [
    ["https://gno.world/", "GET"],
    ["https://gno.world/w/bubble.data", "GET"],
    ["https://gno.world/assets/other-AAAAAAAA.js", "GET"],
    [`https://rpc.gno.land${PRECACHE[0] ?? ""}`, "GET"],
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
  listen(worker, PRECACHE, "v2");
  for (const data of [null, undefined, "SKIP_WAITING", { type: "OTHER" }, { kind: "SKIP_WAITING" }]) {
    fire("message", { data, waitUntil: () => undefined });
  }
  expect(worker.skipWaiting).not.toHaveBeenCalled();
  const { event, done } = lifecycle();
  fire("message", { ...event, data: { type: "SKIP_WAITING" } });
  await done();
  expect(worker.skipWaiting).toHaveBeenCalledOnce();
});
