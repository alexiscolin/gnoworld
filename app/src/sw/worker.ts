// The worker's rules (ADR-0001 §12): precache the build's hashed files, answer them from the
// cache, cache nothing else, and take over only when the page asks. The scope is a parameter, so
// the same rules run in the tests and in the browser (sw.ts).
import { integrity } from "./digest.ts";

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

// A file to precache: its path, and the digest its bytes must have, as subresource integrity
// spells it (app/vite.config.ts computes it from the build).
export interface Precached {
  readonly url: string;
  readonly integrity: string;
}

// No put: the worker writes nothing but the precache list.
export interface WorkerCache {
  addAll(requests: readonly Request[]): Promise<void>;
  keys(): Promise<readonly Request[]>;
  match(request: Request): Promise<Response | undefined>;
  delete(request: Request): Promise<boolean>;
}

export interface WorkerScope {
  readonly location: { readonly origin: string };
  readonly caches: {
    open(name: string): Promise<WorkerCache>;
    delete(name: string): Promise<boolean>;
    match(request: Request, options: { cacheName: string }): Promise<Response | undefined>;
  };
  readonly clients: { claim(): Promise<void> };
  readonly registration: { unregister(): Promise<boolean> };
  skipWaiting(): Promise<void>;
  fetch(request: Request): Promise<Response>;
  addEventListener(type: "install" | "activate", listener: (event: LifecycleEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: RequestEvent) => void): void;
  addEventListener(type: "message", listener: (event: WorkerMessage) => void): void;
}

// One cache for every version: a file stays while its bytes are the build's, so a new version
// fetches only the files it lacks, and drops the others once it takes over.
const CACHE = "gnoworld-precache";

// A listed file held with other bytes is dropped at once: the version still running then fetches
// it, and this one fetches it again with its digest, which the browser checks.
async function kept(cache: WorkerCache, request: Request, want: string | undefined) {
  if (want === undefined) return undefined;
  const held = await cache.match(request);
  if (held !== undefined && (await integrity(await held.arrayBuffer())) === want) return request.url;
  await cache.delete(request);
  return undefined;
}

// What the page sends when its visitor asks for the new version (register.ts).
export const TAKE_OVER = { type: "SKIP_WAITING" } as const;

const asksToTakeOver = (data: unknown) =>
  typeof data === "object" && data !== null && "type" in data && data.type === TAKE_OVER.type;

export function precache(scope: WorkerScope, files: readonly Precached[]): void {
  const listed = new Map(files.map(({ url, integrity }) => [new URL(url, scope.location.origin).href, integrity]));
  scope.addEventListener("install", (event) => {
    event.waitUntil(
      scope.caches.open(CACHE).then(async (cache) => {
        const requests = await cache.keys();
        const held = new Set(
          await Promise.all(requests.map((request) => kept(cache, request, listed.get(request.url)))),
        );
        const missing = [...listed].filter(([url]) => !held.has(url));
        await cache.addAll(missing.map(([url, integrity]) => new Request(url, { integrity })));
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
    // A store that cannot be read is passed over: the host still has the file.
    event.respondWith(
      scope.caches.match(request, { cacheName: CACHE }).then(
        (cached) => cached ?? scope.fetch(request),
        () => scope.fetch(request),
      ),
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

// `?nosw` on any request, a page's first among them: the worker drops its cache and unregisters,
// then the host answers, so the escape works even when the pages it served cannot start.
export function release(scope: WorkerScope): void {
  scope.addEventListener("fetch", (event) => {
    const { request } = event;
    if (!new URL(request.url).searchParams.has("nosw")) return;
    const fromHost = () => scope.fetch(request);
    event.respondWith(
      scope.caches
        .delete(CACHE)
        .then(() => scope.registration.unregister())
        .then(fromHost, fromHost),
    );
  });
}
