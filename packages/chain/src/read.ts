// The browser's one way to read the chain (slice 5 part 2, 5g): `fetch` and Zod, nothing else. One GET of an https address,
// its answer read under a time limit and a size cap, then through a schema. A fault is a typed state with its next step, and
// every result, good or not, names where it was read and when: the page never shows a number without its source.
// One request a call: no retry, no timer left behind, so nothing polls. Unlike lib/api/http.ts it caps the answer's size.
import type * as z from "zod/mini";
import { fetchBytes, type ChainFetch, type FailureKind } from "./transport.ts";

export type { ChainFetch, FailureKind };

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
  /** Ends the request early: a page that left. */
  signal?: AbortSignal;
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
  "other-chain":
    "The node answering is not this universe's chain, so nothing of it was read. Check the universe's RPC in the data.",
  "not-landed": "The chain has not put this transaction in a block yet. It may still be on its way.",
};

/** A failed read of a kind of ours, for a layer above the transport: the failure carries our sentence, never the answer's. */
export function failedRead<T>(kind: FailureKind, source: Source, status?: number): ChainRead<T> {
  return { ok: false, failure: { kind, next: NEXT[kind], ...(status === undefined ? {} : { status }) }, source };
}

/** Whether an address is https with no credentials in it: the only kind a read asks. */
export function isHttps(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

/** One read of an https address through a schema: the value with its source, or a typed failure with its next step. */
export async function readChain<T>(
  url: string,
  schema: z.ZodMiniType<T>,
  options: ReadOptions = {},
): Promise<ChainRead<T>> {
  const { now = () => new Date(), ...transport } = options;
  const source: Source = { url, at: now().toISOString() };
  const failed = (kind: FailureKind, status?: number): ChainRead<T> => failedRead(kind, source, status);
  if (!isHttps(url)) return failed("refused");
  const fetched = await fetchBytes(url, { ...transport, credentials: "omit", cache: "no-store" });
  if ("kind" in fetched) return failed(fetched.kind, fetched.status);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fetched.bytes));
  } catch {
    return failed("not-json");
  }
  const parsed = schema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data, source } : failed("wrong-shape");
}
