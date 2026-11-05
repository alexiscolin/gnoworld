// The one way out of the server (ADR-0002 §7): a call carries its timeout and follows no redirect,
// whatever the caller asks, and what comes back is read up to a size. Where it may go is the egress
// proxy's to decide (slice 3e). A read through it is capped, and its fault named by a kind, never by what
// the answer or the error held.
import { cappedBytes, isPublicOrigin, jsonOf } from "@gnoworld/core";

/** The one way out's shape, which a caller's test stands in for. */
export type Send = (url: string, init: RequestInit, ms: number) => Promise<Response>;

export const send: Send = (url, init, ms) => {
  // The caller's own signal stops it too: the first of the two to fire, so its timeout always holds.
  const timeout = AbortSignal.timeout(ms);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(url, { ...init, signal, redirect: "error" });
};

/** Every way a read through it can end badly: what a log may say of a fault. */
export type Kind =
  | "request"
  | "unresolved"
  | "refused"
  | "proxy"
  | "timeout"
  | "status"
  | "rate_limited"
  | "too_large"
  | "too_many"
  | "not_json"
  | "shape"
  | "no_price"
  | "chain_refused"
  | "path"
  | "empty"
  | "write"
  | "stopped"
  | "other_chain";

export class Failure extends Error {
  readonly kind: Kind;
  constructor(kind: Kind) {
    super(kind);
    this.kind = kind;
  }
}

// A call's fault by its causes' codes, as fetch gives them (undici in Node 24.22.0 and 26.12.0, measured on 2026-11-05; F4872): the way out's
// refusal of a tunnel is undici's abort two causes down. A code alone is read, never a message, which names the host.
function kindOfCode(code: unknown): Kind | undefined {
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "unresolved";
    case "ECONNREFUSED":
      return "refused";
    case "UND_ERR_ABORTED":
      return "proxy";
    default:
      return undefined;
  }
}

/** The kind of a fault: a Failure's own, a call that ran out of time, a call named by the code of the error or of its first three causes,
 * or a request whose cause has no name here. */
export function kindOf(error: unknown): Kind {
  if (error instanceof Failure) return error.kind;
  const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  if (timedOut) return "timeout";
  let cause = error;
  for (let read = 0; read < 4 && cause instanceof Error; read += 1) {
    const kind = "code" in cause ? kindOfCode(cause.code) : undefined;
    if (kind !== undefined) return kind;
    cause = cause.cause;
  }
  return "request";
}

/** A call that reached no one: no address for its name, or nothing listening there. A cause with no name here (a reset, a bad
 * certificate) may have reached the host. */
export const reachedNothing = (kind: Kind): boolean => kind === "unresolved" || kind === "refused";

/** What a call may take and give back: the time it has and the most bytes of the answer it reads. */
export interface Limits {
  readonly ms: number;
  readonly maxBytes: number;
}

/** The body, at most `maxBytes` of it, or a Failure; a longer one is cancelled where it is, unread to its end. */
export async function readBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (reader === undefined) return new Uint8Array();
  let bytes: Uint8Array | null;
  try {
    bytes = await cappedBytes(reader, maxBytes);
  } catch (error) {
    throw new Failure(kindOf(error));
  }
  if (bytes === null) throw new Failure("too_large");
  return bytes;
}

/** One call through `through`: the body's bytes, or a Failure. */
export async function fetchCapped(
  through: Send,
  request: { readonly url: string; readonly init: RequestInit },
  limits: Limits,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await through(request.url, request.init, limits.ms);
  } catch (error) {
    throw new Failure(kindOf(error));
  }
  if (response.status === 429) throw new Failure("rate_limited");
  if (!response.ok) throw new Failure("status");
  return readBytes(response, limits.maxBytes);
}

/** What a text holds, or a `not_json` Failure, which quotes none of it. */
export function jsonOrFail(text: string): unknown {
  const value = jsonOf(text);
  if (value === undefined) throw new Failure("not_json");
  return value;
}

/** An address reached from data, or null: https on a public name, no user and no password. */
export function publicUrl(address: string): URL | null {
  const url = URL.parse(address);
  return url !== null && url.username === "" && url.password === "" && isPublicOrigin(url.origin) ? url : null;
}

/** The body's text, at most `max` bytes of it; undefined for a longer one, whose stream is cut off. */
export async function readCapped(response: Response, max: number): Promise<string | undefined> {
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part: { done: boolean; value?: Uint8Array } = await reader.read();
    if (part.done || part.value === undefined) break;
    size += part.value.byteLength;
    if (size > max) {
      try {
        await reader.cancel();
      } catch {
        // Cut off already, or failing to be: the answer is refused either way.
      }
      return undefined;
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The body's JSON, at most `max` bytes of it; undefined for a longer one, for text that is no JSON, and for an answer
 * whose status is no success, whose body is cut off unread so its connection is free at once (F5273). */
export async function readJson(response: Response, max: number): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel();
    return undefined;
  }
  const text = await readCapped(response, max);
  // Text that is no JSON is an answer of no shape, as one too long is.
  return text === undefined ? undefined : jsonOf(text);
}
