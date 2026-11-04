// What the worlds job asks an indexer for a realm (slice 7, 7c): the transactions whose messages target that path, counted as calls,
// callers and the last height of a call. THE ANSWER'S SHAPE IS OURS, NOT RECORDED (F2950, as app/src/lib/chain/indexer.ts's is):
// no indexer answer was read through gnomcp, so the first live proof is deploy/test.sh. History holds DIRECT calls only
// (chain-feasibility.md, "Corrections"), and a line may be a failed transaction: a count is a count of attempts, and a realm with
// none is not dead. The query asks for no file body (a deploy carries its whole source) and sends the path as a variable.
import { isAddress } from "@gnoworld/core";
import { ChainCount, RealmPath } from "@gnoworld/schemas/indexer";
import { z } from "zod";
import { jsonOf } from "../net.ts";
import { fetchText, Failure, kindOf, type Kind, type Send } from "./remote.ts";

/** The most bytes of one answer: about 38,000 lines of a call, far past the busiest realm recorded. */
export const HISTORY_MAX_BYTES = 4 * 1024 * 1024;
const HISTORY_MS = 20_000;
/** The most indexer calls one pass makes: 10,000 calls are about 42 minutes at the pause between calls, a little past the cycle. */
export const HISTORY_MAX_CALLS = 10_000;

const QUERY =
  "query($path: String!) { getTransactions(where: { messages: { value: { pkg_path: { eq: $path } } } }) { block_height messages { value { __typename ... on MsgCall { pkg_path caller } } } } }";

/** What a realm drew above a height (7t3's window): a mark for each transaction with a call to it, its height and its senders, so a
 * transaction is one however many calls it bundles, to one realm or several of a world; and the different addresses that sent them. Both
 * sorted. Two transactions of one block from the same senders are one mark: an undercount, never more. */
export interface Recent {
  readonly transactions: readonly string[];
  readonly callers: readonly string[];
}

export interface History {
  /** Calls made to the realm, failed ones included. */
  readonly calls: number;
  readonly callers: number;
  /** The height of the last call, or null when there was none. */
  readonly lastHeight: number | null;
  /** Its window above the height the job asked from, none when it asked from none. */
  readonly recent?: Recent;
}

/** A realm's history as the job read it, stamped by its clock as it came (7t3: a world's window runs from read to read). */
export type StampedHistory = History & { readonly at: number };

export type HistoryRead = { ok: true; history: History } | { ok: false; kind: Kind };

const Answer = z.object({
  data: z.object({
    getTransactions: z.array(
      z.object({
        block_height: ChainCount,
        messages: z.array(
          z.object({
            value: z.object({
              __typename: z.string(),
              pkg_path: z.optional(z.string()),
              caller: z.optional(z.string().check(z.refine(isAddress, { message: "an address" }))),
            }),
          }),
        ),
      }),
    ),
  }),
  errors: z.optional(z.never()),
});

/**
 * The realms this pass asks the indexer about: all of them up to `max`; past it a run of `max`, starting `max` further on at each
 * pass number and wrapping round, so every realm is reached within ceil(n / max) passes in a row. No state is stored.
 */
export function realmsOfPass(paths: readonly string[], pass: number, max = HISTORY_MAX_CALLS): string[] {
  if (paths.length <= max) return [...paths];
  const start = (pass * max) % paths.length;
  return Array.from({ length: max }, (_, i) => paths[(start + i) % paths.length] ?? "");
}

// The transactions above `since`, each marked by its height and the senders of all its calls, and the different addresses that called it.
function recentOf(
  rows: readonly { height: number; callers: readonly string[]; senders: readonly string[] }[],
  since: number,
): Recent {
  const above = rows.filter(({ height }) => height > since);
  const marks = new Set(above.map(({ height, senders }) => `${String(height)}:${senders.join(",")}`));
  return { transactions: [...marks].sort(), callers: [...new Set(above.flatMap(({ callers }) => callers))].sort() };
}

/** A realm's history, and with `since` its window above that height (the last file's for the realm). */
export async function readHistory(
  reader: { send: Send; indexer: string; pace?: () => Promise<void> },
  path: string,
  since?: number,
): Promise<HistoryRead> {
  if (!RealmPath.safeParse(path).success) return { ok: false, kind: "path" };
  try {
    await reader.pace?.();
    const init = {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { path } }),
    };
    const text = await fetchText(
      reader.send,
      { url: reader.indexer, init },
      { ms: HISTORY_MS, maxBytes: HISTORY_MAX_BYTES },
    );
    const answer = Answer.safeParse(jsonOf(text));
    if (!answer.success) throw new Failure("shape");
    // A transaction may bundle calls to several realms: only the messages aimed at this path count, and a transaction with none is left out.
    // Each row keeps its calls, the different addresses that sent them and the senders of all its calls (its mark's), each sorted; a call
    // that names none adds no address.
    const known = (calls: readonly { caller?: string | undefined }[]): string[] =>
      [...new Set(calls.flatMap(({ caller }) => (caller === undefined ? [] : [caller])))].sort();
    const rows = answer.data.data.getTransactions.flatMap((row) => {
      const calls = row.messages.flatMap(({ value }) => {
        if (value.__typename !== "MsgCall") return [];
        if (value.pkg_path === undefined) throw new Failure("shape");
        return [{ path: value.pkg_path, caller: value.caller }];
      });
      const aimed = calls.filter((call) => call.path === path);
      return aimed.length === 0
        ? []
        : [{ height: row.block_height, calls: aimed.length, callers: known(aimed), senders: known(calls) }];
    });
    return {
      ok: true,
      history: {
        calls: rows.reduce((sum, { calls }) => sum + calls, 0),
        callers: new Set(rows.flatMap(({ callers }) => callers)).size,
        lastHeight: rows.length === 0 ? null : rows.reduce((last, { height }) => Math.max(last, height), 0),
        ...(since === undefined ? {} : { recent: recentOf(rows, since) }),
      },
    };
  } catch (error) {
    return { ok: false, kind: kindOf(error) };
  }
}
