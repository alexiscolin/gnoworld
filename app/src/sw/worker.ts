// The worker's rules (ADR-0001 §12, nuanced by the 2026-10-18 decision): precache the build's hashed files and
// its shell into a cache of each version, answer from it, cache nothing else, keep the version before until
// the next one takes over, and take over only when the page asks. The scope is a parameter, so the same
// rules run in the tests and in the browser (sw.ts).
import { integrity } from "./digest.ts";
import { isHashed } from "./precache.ts";

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
    keys(): Promise<readonly string[]>;
    match(request: Request, options?: { cacheName: string }): Promise<Response | undefined>;
  };
  readonly clients: { claim(): Promise<void> };
  readonly registration: { unregister(): Promise<boolean> };
  skipWaiting(): Promise<void>;
  fetch(request: Request): Promise<Response>;
  addEventListener(type: "install" | "activate", listener: (event: LifecycleEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: RequestEvent) => void): void;
  addEventListener(type: "message", listener: (event: WorkerMessage) => void): void;
}

// Every cache of the worker's starts with this; a cache of anything else (the rooms', later) is not its to drop.
const CACHE = "gnoworld-precache";

const ownCache = (name: string) => name === CACHE || name.startsWith(`${CACHE}-`);

/** The cache of a version: its list, digests included, names it, so a version fetches into a cache of its own
 * and the version before keeps its files until the next one takes over (F172). */
export async function cacheName(files: readonly Precached[]): Promise<string> {
  const digest = await integrity(new TextEncoder().encode(JSON.stringify(files)));
  return `${CACHE}-${digest
    .slice("sha384-".length)
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 16)}`;
}

// Which version runs is the name of an empty cache, "-active-{running}-{the one before, or none}": the worker
// writes no file but the precache list's, and a name needs no parsing of stored text. Read last-made first.
function running(names: readonly string[]): { current: string; before: string | null } | undefined {
  for (const name of [...names].reverse()) {
    const [, current, before] = /^gnoworld-precache-active-([A-Za-z0-9]{16})-([A-Za-z0-9]{16}|none)$/.exec(name) ?? [];
    if (current !== undefined && before !== undefined)
      return { current: `${CACHE}-${current}`, before: before === "none" ? null : `${CACHE}-${before}` };
  }
  return undefined;
}

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

// What a path the build never made gets with no network: the shell, whose router shows its own not found.
const FALLBACK = "/__spa-fallback.html";

export function precache(scope: WorkerScope, files: readonly Precached[]): void {
  const listed = new Map(files.map(({ url, integrity }) => [new URL(url, scope.location.origin).href, integrity]));
  const own = cacheName(files);
  scope.addEventListener("install", (event) => {
    event.waitUntil(
      own.then(async (name) => {
        const cache = await scope.caches.open(name);
        const requests = await cache.keys();
        const held = new Set(
          await Promise.all(requests.map((request) => kept(cache, request, listed.get(request.url)))),
        );
        const missing = [...listed].filter(([url]) => !held.has(url));
        await cache.addAll(missing.map(([url, integrity]) => new Request(url, { integrity })));
      }),
    );
  });
  // This version runs: the one before it stays for the tabs still on it, and every other goes, the ones that
  // never took over included.
  scope.addEventListener("activate", (event) => {
    event.waitUntil(
      Promise.all([own, scope.caches.keys()]).then(async ([name, names]) => {
        const last = running(names);
        const before = last === undefined || last.current === name ? (last?.before ?? null) : last.current;
        const id = (cache: string) => cache.slice(CACHE.length + 1);
        const record = `${CACHE}-active-${id(name)}-${before === null ? "none" : id(before)}`;
        await scope.caches.open(record);
        const keep = new Set([name, before, record]);
        await Promise.all(
          names.filter((each) => ownCache(each) && !keep.has(each)).map((each) => scope.caches.delete(each)),
        );
      }),
    );
  });
  scope.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);
    // `?nosw` is release's.
    if (request.method !== "GET" || url.origin !== scope.location.origin || url.searchParams.has("nosw")) return;
    // This version's cache first; for a hashed file, whose name is its content's, any version's: the tab still
    // on the version before asks for files only that one listed. A store that cannot be read is passed over:
    // the host still has the file.
    const answer = (lookup: Request, anyVersion: boolean) =>
      own
        .then(async (name) => {
          const cached = await scope.caches.match(lookup, { cacheName: name });
          if (cached !== undefined || !anyVersion) return cached;
          // Only the worker's own caches: a copy planted in another would outlive every update.
          for (const other of (await scope.caches.keys()).filter(ownCache)) {
            const found = await scope.caches.match(lookup, { cacheName: other });
            if (found !== undefined) return found;
          }
          return undefined;
        })
        .then(
          (cached) => cached ?? scope.fetch(request),
          () => scope.fetch(request),
        );
    if (request.mode === "navigate") {
      // A page is found by its path: the query is the visitor's, the page the same.
      const page = new URL(url.pathname, url.origin);
      if (listed.has(page.href)) {
        event.respondWith(answer(new Request(page), false));
        return;
      }
      // The host unreachable: the shell, or, held nowhere, the network's own failure (answer asks the host again).
      event.respondWith(scope.fetch(request).catch(() => answer(new Request(new URL(FALLBACK, url.origin)), false)));
      return;
    }
    const hashed = url.search === "" && isHashed(url.pathname.slice(1));
    if (hashed || listed.has(url.href)) event.respondWith(answer(request, hashed));
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

// `?nosw` on any request, a page's first among them: the worker drops its caches and unregisters,
// then the host answers, so the escape works even when the pages it served cannot start.
export function release(scope: WorkerScope): void {
  scope.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);
    // The visitor's own way out: a request of this site's, not a picture from another that carries the word.
    if (request.method !== "GET" || url.origin !== scope.location.origin || !url.searchParams.has("nosw")) return;
    const fromHost = () => scope.fetch(request);
    event.respondWith(
      scope.caches
        .keys()
        .then((names) => Promise.all(names.filter(ownCache).map((name) => scope.caches.delete(name))))
        .then(() => scope.registration.unregister())
        .then(fromHost, fromHost),
    );
  });
}
