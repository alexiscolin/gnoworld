// One transaction by its hash (9d): what the call card follows after Adena signs, until the transaction is in a block. The
// block's height, the call's returned value and its log come from the node's `tx`, never from the wallet's word. What the
// realm wrote is text, cut at a size the card can hold, and never read as anything else.
import { TxAnswer } from "@gnoworld/schemas/indexer";
import { guarded, textOf, withoutSlash, type NodeOptions } from "./node.ts";
import { failedRead, readChain, sourceOf, type ChainRead } from "./read.ts";

type Result = NonNullable<TxAnswer["result"]>;

export interface Landed {
  /** The block the transaction is in. */
  height: number;
  /** The realm refused the call: `log` is its error log. */
  failed: boolean;
  /** The value the call returned, as text. */
  data: string;
  log: string;
}

/** The most characters of the realm's value and log kept. */
const CAP = 2048;
const cut = (text: string): string => (text.length <= CAP ? text : `${text.slice(0, CAP).toWellFormed()}…`);

// A hash in base64 as lower-case hex, or null for a text that is no base64.
function hexOf(base64: string): string | null {
  try {
    return Array.from(atob(base64), (char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

// What a node's result gives, or null for one that is not this hash's, has no usable height or has a value that is no text.
function landedOf({ hash, height: text, tx_result: done }: Result, want: string): Landed | null {
  const height = Number(text);
  const { Error: refused, Data: data, Log: log = "" } = done.ResponseBase;
  const value = data === undefined || data === null || data === "" ? "" : textOf(data);
  if (hexOf(hash) !== want || !Number.isSafeInteger(height) || height < 1 || value === null) return null;
  return { height, failed: refused !== undefined && refused !== null, data: cut(value), log: cut(log) };
}

/** The transaction of `hash` (hex, either case) on the universe's node, or why not: `not-landed` while the node has none. */
export function readTransaction(rpc: string, hash: string, options: NodeOptions): Promise<ChainRead<Landed>> {
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) return Promise.resolve(failedRead("bad-name", sourceOf(rpc, options)));
  const want = hash.toLowerCase();
  return guarded(rpc, options, async (read) => {
    const answer = await readChain(`${withoutSlash(rpc)}/tx?hash=0x${want}`, TxAnswer, read);
    const failed = (kind: Parameters<typeof failedRead>[0]) => failedRead<Landed>(kind, answer.source);
    if (!answer.ok) return failedRead<Landed>(answer.failure.kind, answer.source, answer.failure.status);
    const { result, error } = answer.value;
    if (result === undefined) {
      if (error === undefined) return failed("wrong-shape");
      // The node's own sentence for a hash it has no result for (state/errors.go:84); any other fault is the chain's refusal.
      const none = `Could not find tx result for hash #${want.toUpperCase()}`;
      return failed(error.data === none ? "not-landed" : "chain-refused");
    }
    const value = landedOf(result, want);
    return value === null ? failed("wrong-shape") : { ok: true, value, source: answer.source };
  });
}
