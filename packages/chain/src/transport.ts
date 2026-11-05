// The capped, timed GET of every chain read (the browser's since 5g, 5m's markets too; the server's and Jarvis's since 10h):
// the bytes of an answer under a time limit and a size cap, or a kind of failure. Nothing here reads a schema: `read.ts` does.
// This site's own files are read here too (7n2): a module of their own, shared by the first screen and the scene's chunk, would be a
// chunk that every lazy chunk names.
import { cappedBytes } from "@gnoworld/core";
import type * as z from "zod/mini";

/** The time an answer has, its body read included. */
const CHAIN_TIMEOUT_MS = 8_000;
/** The most bytes an answer may weigh; past it the read stops and the rest is not kept. */
const CHAIN_MAX_BYTES = 1024 * 1024;

export type ChainFetch = (url: string, init?: RequestInit) => Promise<Response>;

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
  | "other-chain";

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
  credentials: NonNullable<RequestInit["credentials"]>;
  cache: RequestInit["cache"];
  maxBytes: number;
}

// The attempt, which never throws: whatever goes wrong is a kind.
async function attempt({ url, fetcher, signal, credentials, cache, maxBytes }: Attempt): Promise<Fetched> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      credentials,
      redirect: "error",
      ...(cache === undefined ? {} : { cache }),
      headers: { accept: "application/json" },
      signal,
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
 * a request honouring its signal, and the work's requests end through the signal it is given. No timer and no listener is
 * left behind.
 */
export async function withinTime<T>(
  { timeoutMs = CHAIN_TIMEOUT_MS, signal: outer }: Limits,
  ends: { timeout: T; left: T },
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (outer?.aborted === true) return ends.left;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let leave: (() => void) | undefined;
  const ended = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      controller.abort(new DOMException("the answer took too long", "TimeoutError"));
      resolve(ends.timeout);
    }, timeoutMs);
    leave = () => {
      controller.abort(outer?.reason);
      resolve(ends.left);
    };
    outer?.addEventListener("abort", leave, { once: true });
  });
  try {
    return await Promise.race([work(controller.signal), ended]);
  } finally {
    clearTimeout(timer);
    if (leave !== undefined) outer?.removeEventListener("abort", leave);
  }
}

/** The one capped, timed GET of the browser: the bytes of the answer, or a kind. */
export function fetchBytes(url: string, options: Transport): Promise<Fetched> {
  const { fetch: fetcher = (address, init) => fetch(address, init), maxBytes = CHAIN_MAX_BYTES } = options;
  const { credentials, cache } = options;
  return withinTime(options, { timeout: { kind: "timeout" }, left: { kind: "down" } }, (signal) =>
    attempt({ url, fetcher, signal, credentials, cache, maxBytes }),
  );
}

export interface SiteFileRead {
  fetch?: ChainFetch;
  signal?: AbortSignal;
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
  if ("kind" in answer) return undefined;
  try {
    return schema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(answer.bytes))).data;
  } catch {
    return undefined;
  }
}
