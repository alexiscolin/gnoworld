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

export interface History {
  /** Calls made to the realm, failed ones included. */
  readonly calls: number;
  readonly callers: number;
  /** The height of the last call, or null when there was none. */
  readonly lastHeight: number | null;
}

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

export async function readHistory(
  reader: { send: Send; indexer: string; pace?: () => Promise<void> },
  path: string,
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
    // A transaction may bundle calls to several realms: only the messages aimed at this path count.
    const calls = answer.data.data.getTransactions.flatMap((row) =>
      row.messages.flatMap(({ value }) => {
        if (value.__typename !== "MsgCall") return [];
        if (value.pkg_path === undefined) throw new Failure("shape");
        return value.pkg_path === path ? [{ height: row.block_height, caller: value.caller }] : [];
      }),
    );
    const callers = new Set(calls.flatMap(({ caller }) => (caller === undefined ? [] : [caller])));
    return {
      ok: true,
      history: {
        calls: calls.length,
        callers: callers.size,
        lastHeight: calls.length === 0 ? null : calls.reduce((last, { height }) => Math.max(last, height), 0),
      },
    };
  } catch (error) {
    return { ok: false, kind: kindOf(error) };
  }
}
