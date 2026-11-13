// The capped, timed GET of every chain read (the browser's since 5g, 5m's markets too; the server's and Jarvis's since 10h):
// the bytes of an answer under a time limit and a size cap, or a kind of failure. Nothing here reads a schema: `read.ts` does.
// This site's own files are read here too (7n2): a module of their own, shared by the first screen and the scene's chunk, would be a
// chunk that every lazy chunk names.
import { cappedBytes } from "@gnoworld/core";
import { jsonOfBytes } from "@gnoworld/schemas";
import type * as z from "zod/mini";

/** The time an answer has, its body read included. */
const CHAIN_TIMEOUT_MS = 8_000;
/** The most bytes an answer may weigh; past it the read stops and the rest is not kept. */
const CHAIN_MAX_BYTES = 1024 * 1024;

/** A request's options: `onWait(true)` from a gate in front of the network when the request starts waiting its turn, `onWait(false)` when
 * the turn comes. */
export type ChainInit = RequestInit & { onWait?: (waiting: boolean) => void };
export type ChainFetch = (url: string, init?: ChainInit) => Promise<Response>;

/** A request's options for a way out with no gate in front of it (a server's own): the gate's hook left out. */
export function requestInit(init: ChainInit = {}): RequestInit {
  const plain: ChainInit = { ...init };
  delete plain.onWait;
  return plain;
}

export type FailureKind =
  | "refused"
  | "down"
  | "timeout"
  | "too-big"
  | "not-json"
  | "wrong-shape"
  | "no-realm"
  | "no-page"
  | "chain-refused"
  | "bad-name"
  | "other-chain"
  | "not-landed";

// A stream not read to its end is cancelled, so its connection is freed; one already closed or broken has nothing to free.
async function drop(stream: { cancel(): Promise<void> } | null | undefined): Promise<void> {
  try {
    await stream?.cancel();
  } catch {
    return;
  }
}

// The body's bytes, or why not.
async function bodyOf(response: Response, maxBytes: number): Promise<Uint8Array | "too-big" | "down"> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await drop(response.body);
    return "too-big";
  }
  const reader = response.body?.getReader();
  if (reader === undefined) return new Uint8Array();
  try {
    return (await cappedBytes(reader, maxBytes)) ?? "too-big";
  } catch {
    return "down";
  }
}

/** What ends a piece of work early: its time limit, and its caller's signal. */
export interface Limits {
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

/** What a transport is given: the address's answer is read under the limit and the cap, with the credentials the caller names. */
export interface Transport extends Limits {
  fetch?: ChainFetch;
  maxBytes?: number;
  /** Whether the request carries cookies: `omit` for a chain, `same-origin` for this site's own file. */
  credentials: NonNullable<RequestInit["credentials"]>;
  cache?: RequestInit["cache"];
}

export type Fetched = { bytes: Uint8Array; status: number } | { kind: FailureKind; status?: number };

interface Attempt {
  url: string;
  fetcher: ChainFetch;
  signal: AbortSignal;
  onWait: (waiting: boolean) => void;
  credentials: NonNullable<RequestInit["credentials"]>;
  cache: RequestInit["cache"];
  maxBytes: number;
}

// The attempt, which never throws: whatever goes wrong is a kind.
async function attempt({ url, fetcher, signal, onWait, credentials, cache, maxBytes }: Attempt): Promise<Fetched> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      credentials,
      redirect: "error",
      ...(cache === undefined ? {} : { cache }),
      headers: { accept: "application/json" },
      signal,
      onWait,
    });
  } catch {
    return { kind: "down" };
  }
  if (!response.ok) {
    await drop(response.body);
    return { kind: "down", status: response.status };
  }
  const bytes = await bodyOf(response, maxBytes);
  return typeof bytes === "string" ? { kind: bytes } : { bytes, status: response.status };
}

/**
 * Work under one time limit and its caller's signal: the limit and the leaving win the race by themselves, so nothing relies on
 * a request honouring its signal, and the work's requests end through the signal it is given. The limit pauses while the work says
 * it waits its turn, and goes on from the turn with what it had left. No timer and no listener is left behind.
 */
export async function withinTime<T>(
  { timeoutMs = CHAIN_TIMEOUT_MS, signal: outer }: Limits,
  ends: { timeout: T; left: T },
  work: (signal: AbortSignal, onWait: (waiting: boolean) => void) => Promise<T>,
): Promise<T> {
  if (outer?.aborted === true) return ends.left;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let time: (running: boolean) => void = () => undefined;
  let leave: (() => void) | undefined;
  // The time the limit has run, and since when it runs again (none while it is paused).
  let ran = 0;
  let since: number | undefined;
  const ended = new Promise<T>((resolve) => {
    time = (running) => {
      clearTimeout(timer);
      if (since !== undefined) ran += Date.now() - since;
      since = running ? Date.now() : undefined;
      if (!running) return;
      timer = setTimeout(
        () => {
          controller.abort(new DOMException("the answer took too long", "TimeoutError"));
          resolve(ends.timeout);
        },
        Math.max(0, timeoutMs - ran),
      );
    };
    time(true);
    leave = () => {
      controller.abort(outer?.reason);
      resolve(ends.left);
    };
    outer?.addEventListener("abort", leave, { once: true });
  });
  try {
    // The requests of the work waiting their turn: the limit goes on once none waits.
    let waiting = 0;
    const onWait = (starts: boolean) => {
      waiting = Math.max(0, waiting + (starts ? 1 : -1));
      time(waiting === 0);
    };
    return await Promise.race([work(controller.signal, onWait), ended]);
  } finally {
    clearTimeout(timer);
    time = () => undefined;
    if (leave !== undefined) outer?.removeEventListener("abort", leave);
  }
}

/** The one capped, timed GET of the browser: the bytes of the answer, or a kind. */
export function fetchBytes(url: string, options: Transport): Promise<Fetched> {
  const { fetch: fetcher = (address, init) => fetch(address, init), maxBytes = CHAIN_MAX_BYTES } = options;
  const { credentials, cache } = options;
  return withinTime(options, { timeout: { kind: "timeout" }, left: { kind: "down" } }, (signal, onWait) =>
    attempt({ url, fetcher, signal, onWait, credentials, cache, maxBytes }),
  );
}

export interface SiteFileRead {
  fetch?: ChainFetch;
  signal?: AbortSignal;
}

/** The JSON `bytes` hold as `schema` reads it, or nothing: no valid UTF-8, no JSON, or a shape the schema refuses. */
export function parseSiteBytes<T>(bytes: Uint8Array, schema: z.ZodMiniType<T>): T | undefined {
  const value = jsonOfBytes(bytes);
  return value === undefined ? undefined : schema.safeParse(value).data;
}

/** A file the server's jobs write from a chain, at this site's `url` (slice 7): its own credentials and cache, under `maxBytes`, as `schema`
 * reads it, or nothing if it did not come whole. Never a throw, for a page has nothing to do with one. */
export async function readSiteFile<T>(
  url: string,
  schema: z.ZodMiniType<T>,
  { maxBytes, fetch, signal }: SiteFileRead & { maxBytes: number },
): Promise<T | undefined> {
  const answer = await fetchBytes(url, {
    ...(fetch === undefined ? {} : { fetch }),
    ...(signal === undefined ? {} : { signal }),
    maxBytes,
    credentials: "same-origin",
  });
  return "kind" in answer ? undefined : parseSiteBytes(answer.bytes, schema);
}
