// The browser's one way to read the chain (slice 5 part 2, 5g): `fetch` and Zod, nothing else. One GET of an https address,
// its answer read under a time limit and a size cap, then through a schema. A fault is a typed state with its next step, and
// every result, good or not, names where it was read and when: the page never shows a number without its source.
// One request a call: no retry, no timer left behind, so nothing polls. Unlike lib/api/http.ts it caps the answer's size.
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
  | "bad-name";

export interface Source {
  /** The address that was asked. */
  readonly url: string;
  /** When it was asked, as an ISO time. */
  readonly at: string;
}

/** Where a read that never reached the network was to be asked, and when: the clock is `options.now`. */
export function sourceOf(url: string, options: ReadOptions): Source {
  return { url, at: (options.now ?? (() => new Date()))().toISOString() };
}

/** The host an address goes to, as the browser reads it; the address itself when it has none or is no address. */
export function hostOf(href: string): string {
  try {
    return new URL(href).host || href;
  } catch {
    return href;
  }
}

export interface Failure {
  readonly kind: FailureKind;
  /** What the reader may do now, in a sentence of ours; never a word of the answer. */
  readonly next: string;
  /** The HTTP status of a `down` that answered. */
  readonly status?: number;
}

export type ChainRead<T> =
  | { readonly ok: true; readonly value: T; readonly source: Source }
  | { readonly ok: false; readonly failure: Failure; readonly source: Source };

export interface ReadOptions {
  fetch?: ChainFetch;
  timeoutMs?: number;
  maxBytes?: number;
  /** The clock, for the source's time. */
  now?: () => Date;
}

const NEXT: Record<FailureKind, string> = {
  refused: "This address is not a secure (https) one, so it was not asked. Check the universe's RPC in the data.",
  down: "The chain's service did not answer. Try again in a moment.",
  timeout: "The chain's service took too long. Try again in a moment.",
  "too-big": "The chain's answer was larger than this page reads. Try a smaller view.",
  "not-json": "The chain's service answered with something that is not data. Try again later.",
  "wrong-shape": "The chain's answer was not the shape this page expects. Try again later, or report it.",
  "no-realm": "This realm is not on this chain. Check its path.",
  "no-page": "This realm has no page to show. Open it on gnoweb.",
  "chain-refused": "The chain refused this read. Try again later, or open it on gnoweb.",
  "bad-name": "This name cannot be read from here. Open it on gnoweb.",
};

/** A failed read of a kind of ours, for a layer above the transport: the failure carries our sentence, never the answer's. */
export function failedRead<T>(kind: FailureKind, source: Source, status?: number): ChainRead<T> {
  return { ok: false, failure: { kind, next: NEXT[kind], ...(status === undefined ? {} : { status }) }, source };
}

type Outcome = { kind: FailureKind; status?: number } | { value: unknown };

/** Whether an address is https with no credentials in it: the only kind a read asks. */
export function isHttps(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

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

interface Attempt {
  url: string;
  fetcher: ChainFetch;
  signal: AbortSignal;
  maxBytes: number;
}

// The attempt, which never throws: whatever goes wrong is a kind.
async function attempt({ url, fetcher, signal, maxBytes }: Attempt): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
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
  if (typeof bytes === "string") return { kind: bytes };
  try {
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { kind: "not-json" };
  }
}

/** One read of an https address through a schema: the value with its source, or a typed failure with its next step. */
export async function readChain<T>(
  url: string,
  schema: z.ZodMiniType<T>,
  options: ReadOptions = {},
): Promise<ChainRead<T>> {
  const { fetch: fetcher = (address, init) => fetch(address, init), timeoutMs = CHAIN_TIMEOUT_MS } = options;
  const { maxBytes = CHAIN_MAX_BYTES, now = () => new Date() } = options;
  const source: Source = { url, at: now().toISOString() };
  const failed = (kind: FailureKind, status?: number): ChainRead<T> => failedRead(kind, source, status);
  if (!isHttps(url)) return failed("refused");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The limit does not rely on fetch honouring its signal: it wins the race by itself.
  const late = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort(new DOMException("the chain took too long", "TimeoutError"));
      resolve({ kind: "timeout" });
    }, timeoutMs);
  });
  try {
    const outcome = await Promise.race([attempt({ url, fetcher, signal: controller.signal, maxBytes }), late]);
    if ("kind" in outcome) return failed(outcome.kind, outcome.status);
    const parsed = schema.safeParse(outcome.value);
    return parsed.success ? { ok: true, value: parsed.data, source } : failed("wrong-shape");
  } finally {
    clearTimeout(timer);
  }
}
