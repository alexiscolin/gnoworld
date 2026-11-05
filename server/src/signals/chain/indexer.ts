// The reads the server makes of a universe's public indexer over HTTP (slice 9g): the tip, the transactions after a place (the
// poll's catch-up, a page at a time) and the realms deployed in the last 24 h (the Earth's count at start). The answer is outside
// data: every call has its timeout and no redirect (service/net), an answer is read up to a size, goes through Zod, and a row that
// fails is dropped and said. Every loop has its cap; a count that would stand on a capped history is no count (it fails).
import {
  blocksQuery,
  catchUpQuery,
  deploysQuery,
  placeQuery,
  tipQuery,
  type Place,
} from "@gnoworld/chain/transactions";
import { jsonOf } from "@gnoworld/core";
import { readCapped, send as netSend, type Send } from "@gnoworld/service/net";
import { z } from "zod";
import type { Deploy } from "./count.ts";
import type { Watched } from "./message.ts";

export type IndexerLog =
  "chain_catch_up_row_bad" | "chain_catch_up_page_halved" | "chain_catch_up_row_skipped" | "chain_history_row_bad";

export interface IndexerOptions {
  url: string;
  watch: ReadonlyMap<string, Watched>;
  log: (what: IndexerLog) => void;
  send?: Send | undefined;
}

export const TIMEOUT_MS = 10_000;
export const MAX_BYTES = 1_000_000;
/** Rows a page asks for at most. */
export const PAGE = 500;
export const HISTORY_PAGE = 100;
export const HISTORY_PAGES = 20;

type Ask = (query: string, signal?: AbortSignal) => Promise<unknown>;

/** An answer past the size cap: a page may be asked again, smaller. */
class TooBig extends Error {}

// One POST of a query: the `data` of its answer, or a failure (a status, a body too big or no JSON, an `errors`).
function asker(url: string, send: Send): Ask {
  return async (query, signal) => {
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query }),
      ...(signal === undefined ? {} : { signal }),
    };
    const response = await send(url, init, TIMEOUT_MS);
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("the indexer gave no answer");
    }
    const text = await readCapped(response, MAX_BYTES);
    if (text === undefined) throw new TooBig("the indexer's answer is past its size");
    const answer = z.object({ data: z.unknown(), errors: z.unknown().optional() }).safeParse(jsonOf(text));
    if (!answer.success || answer.data.errors !== undefined) throw new Error("the indexer gave no answer");
    return answer.data.data;
  };
}

// The transactions of an answer, at most `max`: an indexer that ignores its limit is refused, not read.
function rowsOf(data: unknown, max: number): unknown[] {
  const rows = z.object({ getTransactions: z.array(z.unknown()).max(max) }).safeParse(data);
  if (!rows.success) throw new Error("the indexer's answer has no rows of that shape");
  return rows.data.getTransactions;
}

interface Deployed {
  deploys: { height: number; id: string }[];
  lowest: number;
}

// The realms a page of transactions deployed, each with its block; a row that fails its schema is dropped and said.
function deploysOf(rows: unknown[], log: IndexerOptions["log"]): Deployed {
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
async function blockTimes(ask: Ask, heights: number[], signal?: AbortSignal): Promise<Map<number, string>> {
  const times = new Map<number, string>();
  for (let start = 0; start < heights.length; start += 100) {
    const chunk = heights.slice(start, start + 100);
    const Block = z.object({ height: z.number(), time: z.iso.datetime() });
    const blocks = z
      .object({ getBlocks: z.array(Block).max(chunk.length) })
      .safeParse(await ask(blocksQuery(chunk), signal));
    if (!blocks.success) throw new Error("the indexer's blocks have no such shape");
    for (const { height, time } of blocks.data.getBlocks) times.set(height, time);
  }
  return times;
}

/** A transaction as the indexer gave it, with its place. */
export interface Row {
  height: number;
  index: number;
  row: unknown;
}

/** A page of the catch-up: its rows in order, the time of the blocks that deployed a realm, whether another page follows, and a row passed by its place alone. */
export interface Page {
  rows: Row[];
  times: Map<number, string>;
  more: boolean;
  skipped?: Place;
}

const Where = z.object({ block_height: z.number().int().nonnegative(), index: z.number().int().nonnegative() });

export function indexerReaders({ url, watch, log, send = netSend }: IndexerOptions) {
  const ask = asker(url, send);
  // The rows a page asks for: halved when an answer is past the size cap, doubled again by a full page that fit.
  let size = PAGE;
  // A row too big to read, passed by its place: the next row of the range, its body not asked.
  async function skip(after: Place, tip: number, signal?: AbortSignal): Promise<Page> {
    const [next] = rowsOf(await ask(placeQuery(watch.keys(), { after, tip }), signal), 1);
    const place = Where.safeParse(next);
    if (!place.success) throw new Error("the indexer gave no place for the row too big");
    log("chain_catch_up_row_skipped");
    return {
      rows: [],
      times: new Map(),
      more: true,
      skipped: { height: place.data.block_height, index: place.data.index },
    };
  }
  return {
    /** The newest block the indexer holds. */
    async tip(signal?: AbortSignal): Promise<number> {
      const height = z
        .object({ latestBlockHeight: z.number().int().nonnegative() })
        .safeParse(await ask(tipQuery, signal));
      if (!height.success) throw new Error("the indexer gave no height");
      return height.data.latestBlockHeight;
    },
    /** A page of the transactions after a place, up to a tip. */
    async catchUp(after: Place, tip: number, signal?: AbortSignal): Promise<Page> {
      let raw: unknown[];
      try {
        raw = rowsOf(await ask(catchUpQuery(watch.keys(), { after, tip }, size), signal), size);
      } catch (cause) {
        if (!(cause instanceof TooBig)) throw cause;
        if (size === 1) return skip(after, tip, signal);
        size = Math.floor(size / 2);
        log("chain_catch_up_page_halved");
        return { rows: [], times: new Map(), more: true };
      }
      const rows = raw.flatMap((row): Row[] => {
        const place = Where.safeParse(row);
        if (place.success) return [{ height: place.data.block_height, index: place.data.index, row }];
        log("chain_catch_up_row_bad");
        return [];
      });
      // A transaction carries no time and the live blocks of the gap were missed: a deployed realm's block time is given, so it is counted.
      const { deploys } = deploysOf(raw, () => undefined);
      const times = await blockTimes(ask, [...new Set(deploys.map(({ height }) => height))], signal);
      const full = raw.length === size;
      if (full) size = Math.min(PAGE, size * 2);
      return { rows, times, more: full && rows.length > 0 };
    },

    /** The realms deployed since a time (ISO), by their blocks' times. */
    async history(sinceIso: string): Promise<Deploy[]> {
      const since = Date.parse(sinceIso);
      const found = new Map<string, Deploy>();
      let before = Number.POSITIVE_INFINITY;
      for (let page = 0; page < HISTORY_PAGES; page += 1) {
        const rows = rowsOf(
          await ask(deploysQuery(Number.isFinite(before) ? before : undefined, HISTORY_PAGE)),
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
