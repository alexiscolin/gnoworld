// The capped, timed GET of every chain read (the browser's since 5g, 5m's markets too; the server's and Jarvis's since 10h):
// the bytes of an answer under a time limit and a size cap, or a kind of failure. Nothing here reads a schema: `read.ts` does.

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

// The chunks of a body, or why not; the reader is cancelled the moment the total passes the cap.
async function chunksOf(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array[] | "too-big" | "down"> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return chunks;
      total += value.byteLength;
      if (total > maxBytes) {
        await drop(reader);
        return "too-big";
      }
      chunks.push(value);
    }
  } catch {
    return "down";
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
  const chunks = reader === undefined ? [] : await chunksOf(reader, maxBytes);
  if (typeof chunks === "string") return chunks;
  const whole = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let at = 0;
  for (const chunk of chunks) {
    whole.set(chunk, at);
    at += chunk.byteLength;
  }
  return whole;
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
