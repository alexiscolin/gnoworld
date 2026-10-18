// The worker's rules (ADR-0001 §12): precache the build's hashed files in this version's cache,
// answer them from it, cache nothing else, and take over only when the page asks. The scope is a
// parameter, so the same rules run in the tests and in the browser (sw.ts).

export interface LifecycleEvent {
  waitUntil(promise: Promise<unknown>): void;
}

export interface RequestEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}

interface WorkerMessage extends LifecycleEvent {
  readonly data: unknown;
}

// No put: the worker writes nothing but the precache list.
export interface WorkerCache {
  addAll(urls: readonly string[]): Promise<void>;
  match(request: Request): Promise<Response | undefined>;
}

export interface WorkerScope {
  readonly location: { readonly origin: string };
  readonly caches: {
    open(name: string): Promise<WorkerCache>;
    keys(): Promise<string[]>;
    delete(name: string): Promise<boolean>;
  };
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  fetch(request: Request): Promise<Response>;
  addEventListener(type: "install" | "activate", listener: (event: LifecycleEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: RequestEvent) => void): void;
  addEventListener(type: "message", listener: (event: WorkerMessage) => void): void;
}

const PREFIX = "gnoworld-";

const asksToTakeOver = (data: unknown) =>
  typeof data === "object" && data !== null && "type" in data && data.type === "SKIP_WAITING";

export function listen(scope: WorkerScope, precache: readonly string[], version: string): void {
  const name = PREFIX + version;
  const listed = new Set(precache);
  scope.addEventListener("install", (event) => {
    event.waitUntil(scope.caches.open(name).then((cache) => cache.addAll(precache)));
  });
  scope.addEventListener("activate", (event) => {
    const stale = (names: string[]) => names.filter((other) => other.startsWith(PREFIX) && other !== name);
    event.waitUntil(
      scope.caches
        .keys()
        .then((names) => Promise.all(stale(names).map((other) => scope.caches.delete(other))))
        .then(() => scope.clients.claim()),
    );
  });
  scope.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== scope.location.origin || !listed.has(url.pathname)) return;
    event.respondWith(
      scope.caches
        .open(name)
        .then((cache) => cache.match(request))
        .then((cached) => cached ?? scope.fetch(request)),
    );
  });
  scope.addEventListener("message", (event) => {
    if (asksToTakeOver(event.data)) event.waitUntil(scope.skipWaiting());
  });
}
