// The worlds job's reads of a chain and its indexer (slice 7, 7c), shared by its readers: one GET or POST through the server's one
// way out with a time limit, a body read as a stream and cut at a byte cap, and a fault named by a kind, never by what the
// answer or the error held. An abci_query goes through the envelope QueryAnswer describes, base64 and UTF-8 checked.
import { QueryAnswer } from "@gnoworld/schemas";

export type Send = (url: string, init: RequestInit, ms: number) => Promise<Response>;

export type Kind =
  | "request"
  | "timeout"
  | "status"
  | "rate_limited"
  | "too_large"
  | "too_many"
  | "not_json"
  | "shape"
  | "chain_refused"
  | "path"
  | "empty"
  | "write"
  | "stopped";

export class Failure extends Error {
  readonly kind: Kind;
  constructor(kind: Kind) {
    super(kind);
    this.kind = kind;
  }
}

/** The kind of a fault: a Failure's own, a call that ran out of time, or a request that reached nothing. */
export function kindOf(error: unknown): Kind {
  if (error instanceof Failure) return error.kind;
  const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  return timedOut ? "timeout" : "request";
}

/** What a call may take and give back: the time it has and the most bytes of the answer it reads. */
export interface Limits {
  readonly ms: number;
  readonly maxBytes: number;
}

// The body, at most `maxBytes` of it; a longer one is cancelled where it is, unread to its end.
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (reader === undefined) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    let part: { done: boolean; value?: Uint8Array };
    try {
      part = await reader.read();
    } catch (error) {
      throw new Failure(kindOf(error));
    }
    if (part.done || part.value === undefined) break;
    size += part.value.byteLength;
    if (size > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // Cut off already, or failing to be: the answer is refused either way.
      }
      throw new Failure("too_large");
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}

/** One call: the body's bytes as UTF-8 text, or a Failure. */
export async function fetchText(
  send: Send,
  request: { readonly url: string; readonly init: RequestInit },
  limits: Limits,
): Promise<string> {
  let response: Response;
  try {
    response = await send(request.url, request.init, limits.ms);
  } catch (error) {
    throw new Failure(kindOf(error));
  }
  if (response.status === 429) throw new Failure("rate_limited");
  if (!response.ok) throw new Failure("status");
  const bytes = await readCapped(response, limits.maxBytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Failure("shape");
  }
}

const hexOf = (text: string): string => Buffer.from(text, "utf8").toString("hex");

// The text of a base64 Data, or null when it is no base64 or no UTF-8.
function textOf(base64: string): string | null {
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(base64, "base64"));
  } catch {
    return null;
  }
}

// Whether the chain refused the query: an error beside the result, or an error in its body.
const refusedBy = (answer: QueryAnswer): boolean =>
  answer.error !== undefined || (answer.result?.response.ResponseBase.Error ?? null) !== null;

// The text an abci_query's envelope carries: its Data decoded, or a Failure.
function envelopeText(json: unknown, maxBytes: number): string {
  const answer = QueryAnswer.safeParse(json);
  if (!answer.success) throw new Failure("shape");
  if (refusedBy(answer.data)) throw new Failure("chain_refused");
  const body = answer.data.result?.response.ResponseBase;
  if (body === undefined) throw new Failure("shape");
  const decoded = textOf(body.Data ?? "");
  if (decoded === null) throw new Failure("shape");
  if (Buffer.byteLength(decoded, "utf8") > maxBytes) throw new Failure("too_large");
  return decoded;
}

/**
 * One abci_query of a chain's RPC (`path` may carry a query, `vm/qpaths?limit=10`): the decoded text of its Data, at most
 * `maxBytes` of it, or a Failure. A refusal by the chain is `chain_refused`; a body that is no envelope is `shape`.
 */
export async function abciQuery(
  chain: { readonly send: Send; readonly rpc: string },
  query: { readonly path: string; readonly data: string },
  limits: Limits,
): Promise<string> {
  const url = `${new URL(chain.rpc).origin}/abci_query?path=${encodeURIComponent(`"${query.path}"`)}&data=0x${hexOf(query.data)}`;
  // Base64 is a third larger than what it carries, and the envelope adds a little.
  const text = await fetchText(
    chain.send,
    { url, init: { method: "GET", headers: { accept: "application/json" } } },
    { ms: limits.ms, maxBytes: Math.ceil((limits.maxBytes * 4) / 3) + 4096 },
  );
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Failure("shape");
  }
  return envelopeText(json, limits.maxBytes);
}

/** Waits before each call but the first of a pass, so the chain and the indexers are asked one call at a time and slowly. */
export function pacer(wait: (ms: number) => Promise<void>, ms: number): () => Promise<void> {
  let first = true;
  return async () => {
    if (first) first = false;
    else await wait(ms);
  };
}
