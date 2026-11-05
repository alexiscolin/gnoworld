// The two reads the server makes of a universe's public indexer over HTTP (slice 9g): the transactions after a block height (a
// reconnection's catch-up) and the realms deployed in the last 24 h (the Earth's count at start). The answer is outside data:
// every call has its timeout and no redirect (service/net), an answer is read up to a size, goes through Zod, and a row that
// fails is dropped and said. Every loop has its cap; a count that would stand on a capped history is no count (it fails).
import { blocksQuery, catchUpQuery, deploysQuery } from "@gnoworld/chain/transactions";
import { readJson, send as netSend, type Send } from "@gnoworld/service/net";
import { z } from "zod";
import type { Deploy } from "./count.ts";
import type { Watched } from "./message.ts";

export type IndexerLog = "chain_catch_up_row_bad" | "chain_catch_up_capped" | "chain_history_row_bad";

export interface IndexerOptions {
  url: string;
  watch: ReadonlyMap<string, Watched>;
  log: (what: IndexerLog) => void;
  send?: Send;
}

export const TIMEOUT_MS = 10_000;
export const MAX_BYTES = 1_000_000;
/** Rows a page asks for, and the pages a read takes at most. */
export const PAGE = 500;
export const PAGES = 5;
export const HISTORY_PAGE = 100;
export const HISTORY_PAGES = 20;

type Ask = (query: string) => Promise<unknown>;

// One POST of a query: the `data` of its answer, or a failure (a status, a body too big or no JSON, an `errors`).
function asker(url: string, send: Send): Ask {
  return async (query) => {
    const init = {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query }),
    };
    const answer = z
      .object({ data: z.unknown(), errors: z.unknown().optional() })
      .safeParse(await readJson(await send(url, init, TIMEOUT_MS), MAX_BYTES));
    if (!answer.success || answer.data.errors !== undefined) throw new Error("the indexer gave no answer");
    return answer.data.data;
  };
}

// The rows of a field of an answer, at most `max`: an indexer that ignores its limit is refused, not read.
function rowsOf(data: unknown, name: string, max: number): unknown[] {
  const rows = z.object({ [name]: z.array(z.unknown()).max(max) }).safeParse(data);
  if (!rows.success) throw new Error("the indexer's answer has no rows of that shape");
  return rows.data[name] ?? [];
}

interface Page {
  deploys: { height: number; id: string }[];
  lowest: number;
}

// The realms a page of transactions deployed, each with its block; a row that fails its schema is dropped and said.
function deploysOf(rows: unknown[], log: IndexerOptions["log"]): Page {
  const Value = z.object({ __typename: z.string(), package: z.object({ path: z.string().max(256) }).optional() });
  const Row = z.object({
    block_height: z.number().int().nonnegative(),
    messages: z.array(z.object({ value: Value })).max(1000),
  });
  let lowest = Number.POSITIVE_INFINITY;
  const deploys = rows.flatMap((row) => {
    const tx = Row.safeParse(row);
    if (!tx.success) {
      log("chain_history_row_bad");
      return [];
    }
    lowest = Math.min(lowest, tx.data.block_height);
    return tx.data.messages.flatMap(({ value }) => {
      const path = value.__typename === "MsgAddPackage" ? value.package?.path : undefined;
      return path?.startsWith("gno.land/r/") === true ? [{ height: tx.data.block_height, id: path }] : [];
    });
  });
  return { deploys, lowest };
}

// The time of each block (a transaction has none), asked 100 heights at a time.
async function blockTimes(ask: Ask, heights: number[]): Promise<Map<number, string>> {
  const times = new Map<number, string>();
  for (let start = 0; start < heights.length; start += 100) {
    const chunk = heights.slice(start, start + 100);
    const Block = z.object({ height: z.number(), time: z.iso.datetime() });
    const blocks = z.object({ getBlocks: z.array(Block).max(chunk.length) }).safeParse(await ask(blocksQuery(chunk)));
    if (!blocks.success) throw new Error("the indexer's blocks have no such shape");
    for (const { height, time } of blocks.data.getBlocks) times.set(height, time);
  }
  return times;
}

export function indexerReaders({ url, watch, log, send = netSend }: IndexerOptions) {
  const ask = asker(url, send);
  return {
    /** The transactions from this height on (this block included: the follower reads one once by its hash), as the subscription's own texts. */
    async catchUp(from: number): Promise<string[]> {
      const texts: string[] = [];
      let cursor = from;
      for (let page = 0; page < PAGES; page += 1) {
        const rows = rowsOf(await ask(catchUpQuery(watch.keys(), cursor, PAGE)), "getTransactions", PAGE);
        let last = cursor;
        for (const row of rows) {
          const tx = z.object({ block_height: z.number() }).loose().safeParse(row);
          if (!tx.success) {
            log("chain_catch_up_row_bad");
            continue;
          }
          last = Math.max(last, tx.data.block_height);
          texts.push(JSON.stringify({ type: "next", id: "tx", payload: { data: { getTransactions: row } } }));
        }
        if (rows.length < PAGE) return texts;
        // A page that moved no further (a block of 500 transactions) would ask for ever.
        if (last <= cursor) break;
        cursor = last;
      }
      log("chain_catch_up_capped");
      return texts;
    },

    /** The realms deployed since a time (ISO), by their blocks' times. */
    async history(sinceIso: string): Promise<Deploy[]> {
      const since = Date.parse(sinceIso);
      const found = new Map<string, Deploy>();
      let before = Number.POSITIVE_INFINITY;
      for (let page = 0; page < HISTORY_PAGES; page += 1) {
        const rows = rowsOf(
          await ask(deploysQuery(Number.isFinite(before) ? before : undefined, HISTORY_PAGE)),
          "getTransactions",
          HISTORY_PAGE,
        );
        const { deploys, lowest } = deploysOf(rows, log);
        const times = await blockTimes(ask, [...new Set(deploys.map(({ height }) => height))]);
        let reached = false;
        for (const { height, id } of deploys) {
          const time = times.get(height);
          if (time === undefined) continue;
          if (Date.parse(time) < since) reached = true;
          else found.set(id, { height, time, id });
        }
        if (reached || rows.length < HISTORY_PAGE) return [...found.values()];
        // A page that moved no further would ask for ever.
        if (lowest + 1 >= before || !Number.isFinite(lowest)) break;
        before = lowest + 1;
      }
      throw new Error("the history is past its cap");
    },
  };
}
