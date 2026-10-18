// The worker's rules (ADR-0001 §12): precache the build's hashed files, answer them from the
// cache, cache nothing else, and take over only when the page asks. The scope is a parameter, so
// the same rules run in the tests and in the browser (sw.ts).

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
  keys(): Promise<readonly Request[]>;
  delete(request: Request): Promise<boolean>;
}

export interface WorkerScope {
  readonly location: { readonly origin: string };
  readonly caches: {
    open(name: string): Promise<WorkerCache>;
    match(request: Request, options: { cacheName: string }): Promise<Response | undefined>;
  };
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  fetch(request: Request): Promise<Response>;
  addEventListener(type: "install" | "activate", listener: (event: LifecycleEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: RequestEvent) => void): void;
  addEventListener(type: "message", listener: (event: WorkerMessage) => void): void;
}

// One cache for every version: a hashed name never holds other bytes, so a new version fetches
// only the files it lacks, and drops the others once it takes over.
const CACHE = "gnoworld-precache";

// What the page sends when its visitor asks for the new version (register.ts).
export const TAKE_OVER = { type: "SKIP_WAITING" } as const;

const asksToTakeOver = (data: unknown) =>
  typeof data === "object" && data !== null && "type" in data && data.type === TAKE_OVER.type;

export function precache(scope: WorkerScope, files: readonly string[]): void {
  const listed = new Set(files.map((file) => new URL(file, scope.location.origin).href));
  scope.addEventListener("install", (event) => {
    event.waitUntil(
      scope.caches.open(CACHE).then(async (cache) => {
        const held = new Set((await cache.keys()).map((request) => request.url));
        await cache.addAll(files.filter((file) => !held.has(new URL(file, scope.location.origin).href)));
      }),
    );
  });
  scope.addEventListener("activate", (event) => {
    event.waitUntil(
      scope.caches.open(CACHE).then(async (cache) => {
        const outdated = (await cache.keys()).filter((request) => !listed.has(request.url));
        await Promise.all(outdated.map((request) => cache.delete(request)));
      }),
    );
  });
  scope.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET" || !listed.has(request.url)) return;
    event.respondWith(
      scope.caches.match(request, { cacheName: CACHE }).then((cached) => cached ?? scope.fetch(request)),
    );
  });
}

export function takeOver(scope: WorkerScope): void {
  scope.addEventListener("activate", (event) => {
    event.waitUntil(scope.clients.claim());
  });
  scope.addEventListener("message", (event) => {
    if (asksToTakeOver(event.data)) event.waitUntil(scope.skipWaiting());
  });
}
