// The worlds job's reads of a chain and its indexer (slice 7, 7c), shared by its readers, on top of the server's one way out
// (net.ts): an answer's text, UTF-8 checked, and an abci_query through the envelope QueryAnswer describes, base64 checked.
import { abciQueryOf } from "@gnoworld/core";
import { QueryAnswer } from "@gnoworld/schemas";
import { Failure, fetchCapped, kindOf, type Kind, type Limits, type Send } from "../net.ts";

export { Failure, kindOf, type Kind, type Send };

/** A fault that says the chain or the network is not answering, which ends a pass; any other is about one read. */
export const isDown = (kind: Kind): boolean =>
  kind === "request" || kind === "timeout" || kind === "status" || kind === "rate_limited";

/** One call: the body's bytes as UTF-8 text, or a Failure. */
export async function fetchText(
  send: Send,
  request: { readonly url: string; readonly init: RequestInit },
  limits: Limits,
): Promise<string> {
  const bytes = await fetchCapped(send, request, limits);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Failure("shape");
  }
}

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
  const url = `${new URL(chain.rpc).origin}${abciQueryOf(query.path, new TextEncoder().encode(query.data))}`;
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
