// What the worlds job asks an indexer for a realm (slice 7, 7c): the transactions whose messages target that path, counted as calls,
// callers and the last height of a call. THE ANSWER'S SHAPE IS OURS, NOT RECORDED (F2950, as app/src/lib/chain/indexer.ts's is):
// no indexer answer was read through gnomcp, so the first live proof is deploy/test.sh. History holds DIRECT calls only
// (chain-feasibility.md, "Corrections"), and a line may be a failed transaction: a count is a count of attempts, and a realm with
// none is not dead. The query asks for no file body (a deploy carries its whole source) and sends the path as a variable.
import { isAddress } from "@gnoworld/core";
import { RealmPath } from "@gnoworld/schemas";
import { z } from "zod";
import { fetchText, Failure, kindOf, type Kind, type Send } from "./remote.ts";

/** The most bytes of one answer: about 38,000 lines of a call, far past the busiest realm recorded. */
export const HISTORY_MAX_BYTES = 4 * 1024 * 1024;
const HISTORY_MS = 20_000;

const QUERY =
  "query($path: String!) { getTransactions(where: { messages: { value: { pkg_path: { eq: $path } } } }) { block_height messages { value { __typename ... on MsgCall { caller } ... on MsgAddPackage { creator } } } } }";

export interface History {
  /** Calls made to the realm, failed ones included. */
  readonly calls: number;
  readonly callers: number;
  /** The height of the last call, or null when there was none. */
  readonly lastHeight: number | null;
}

export type HistoryRead = { ok: true; history: History } | { ok: false; kind: Kind };

const Height = z.number().check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.gte(0), z.lte(1e12));
const Answer = z.object({
  data: z.object({
    getTransactions: z.array(
      z.object({
        block_height: Height,
        messages: z.array(
          z.object({
            value: z.object({
              __typename: z.string(),
              caller: z.optional(z.string().check(z.refine(isAddress, { message: "an address" }))),
            }),
          }),
        ),
      }),
    ),
  }),
  errors: z.optional(z.never()),
});

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
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Failure("not_json");
    }
    const answer = Answer.safeParse(json);
    if (!answer.success) throw new Failure("shape");
    const calls = answer.data.data.getTransactions.flatMap((row) =>
      row.messages.flatMap(({ value }) =>
        value.__typename === "MsgCall" ? [{ height: row.block_height, caller: value.caller }] : [],
      ),
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
