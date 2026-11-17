// This is the browser's only way to read the chain, and it uses just `fetch` and Zod. It sends one GET to an
// https address, reads the answer under a time limit and a size cap, and then checks it against a schema.
// A failure is a typed state that comes with a next step for the reader. Every result, good or not, says where
// it was read and when, so the page never shows a number without its source.
// Each call makes one request, with no retry and no timer left behind, so nothing polls.
// Unlike lib/api/http.ts, it caps the size of the answer.
import type * as z from "zod/mini";
import { jsonOfBytes } from "@gnoworld/schemas";
import { fetchBytes, type ChainFetch, type FailureKind } from "./transport.ts";

export type { ChainFetch, FailureKind };

export interface Source {
  /** The address that was asked. */
  readonly url: string;
  /** When it was asked, as an ISO time. */
  readonly at: string;
}

/** The source of a read that never reached the network: the address it would have asked, and when.
 * The time comes from `options.now`. */
export function sourceOf(url: string, options: ReadOptions): Source {
  return { url, at: (options.now ?? (() => new Date()))().toISOString() };
}

/** The host that an address points to, as the browser reads it.
 * It returns the address itself if there is no host or the text is not an address. */
export function hostOf(href: string): string {
  try {
    return new URL(href).host || href;
  } catch {
    return href;
  }
}

export interface Failure {
  readonly kind: FailureKind;
  /** What the reader can do now, in a sentence we wrote. It never contains any text from the answer. */
  readonly next: string;
  /** The HTTP status, for a `down` failure where the service did answer. */
  readonly status?: number;
}

export type ChainRead<T> =
  | { readonly ok: true; readonly value: T; readonly source: Source }
  | { readonly ok: false; readonly failure: Failure; readonly source: Source };

export interface ReadOptions {
  fetch?: ChainFetch;
  timeoutMs?: number;
  maxBytes?: number;
  /** The clock, used for the time in the source. */
  now?: () => Date;
  /** Ends the request early, for example when the page has been closed. */
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

/** Builds a failed read of one of our failure kinds, for layers above the transport.
 * The failure carries our own sentence, never text from the answer. */
export function failedRead<T>(kind: FailureKind, source: Source, status?: number): ChainRead<T> {
  return { ok: false, failure: { kind, next: NEXT[kind], ...(status === undefined ? {} : { status }) }, source };
}

/** Whether an address is https with no credentials in it. A read only asks addresses of this kind. */
export function isHttps(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

/** Reads one https address and checks the result against a schema.
 * It returns the value with its source, or a typed failure with its next step. */
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
  const value = jsonOfBytes(fetched.bytes);
  if (value === undefined) return failed("not-json");
  const parsed = schema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data, source } : failed("wrong-shape");
}
