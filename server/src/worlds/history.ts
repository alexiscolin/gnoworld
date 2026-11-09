// What the worlds job reads of an indexer (slice 7, 7c; 7k3): every call of the chain, a page at a time by height, each counted for the realm
// it names: calls, callers and the last height of a call. The queries are those onyx-1's indexer answered on 2026-11-04 (onyxIndexer.json):
// it refused 7c's per-realm filter, and took 1.2 to 1.5 s for each realm's. History holds DIRECT calls only, and a line may be a failed
// transaction: a count is a count of attempts, and a realm with none is not dead. No file body is asked (a deploy carries its whole source).
import { callsAbove, callsFirst, callsInBlock, type IndexerAsk } from "@gnoworld/chain/asks";
import { isAddress } from "@gnoworld/core";
import { ChainCount } from "@gnoworld/schemas/indexer";
import { z } from "zod";
import { jsonOrFail } from "@gnoworld/service/net";
import { fetchText, Failure, kindOf, type Kind, type Send } from "./remote.ts";

/** The most bytes of one answer: ten pages' worth at onyx-1's 194 bytes a transaction (387 KB for 2,000, 2026-11-04). */
export const HISTORY_MAX_BYTES = 4 * 1024 * 1024;
/** The transactions a page asks: onyx-1's 6,860 in four pages. */
export const HISTORY_PAGE = 2_000;
/** The most requests one read makes, each a page, halvings and blocks alone included. */
export const HISTORY_MAX_PAGES = 500;
/** The most characters one read takes in all, so a broken indexer cannot run the server past its memory: 24 times onyx-1's whole chain, about
 * 170,000 transactions. ponytail: past it the read gives up; the next step reads only above the last pass's height, keeping each realm's
 * callers. */
export const HISTORY_READ_BYTES = 32 * 1024 * 1024;
const HISTORY_MS = 20_000;

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

/** A realm's history as the job read it, stamped by its clock once the read ended (7t3: a world's window runs from read to read). */
export type StampedHistory = History & { readonly at: number };

/** Every realm's history, and the calls left out: one that names no path, or whose caller is no address (counted with none). */
export type HistoriesRead = { ok: true; histories: Map<string, History>; skipped: number } | { ok: false; kind: Kind };

// An empty page is null, not an empty list (onyx-1). A caller is checked where it is read, so one odd call costs that call alone.
const Page = z.object({
  data: z.object({
    getTransactions: z.nullable(
      z.array(
        z.object({
          block_height: ChainCount,
          messages: z.array(
            z.object({
              value: z.object({
                __typename: z.string(),
                pkg_path: z.nullish(z.string()),
                caller: z.nullish(z.string()),
              }),
            }),
          ),
        }),
      ),
    ),
  }),
  errors: z.optional(z.never()),
});

interface Call {
  readonly path: string;
  readonly caller: string | undefined;
}
/** A transaction as the read gives it: its height and its calls. */
export interface Row {
  readonly height: number;
  readonly calls: readonly Call[];
  readonly skipped: number;
}

// A page's rows, each at `from` or above and none below the one before it, or at most `to`: the order is what the next page's bound
// stands on. A call with no path is left out and one whose caller is no address keeps no caller, both counted as skipped.
function rowsOf(json: unknown, from: number, to = Number.MAX_SAFE_INTEGER): Row[] {
  const page = Page.safeParse(json);
  if (!page.success) throw new Failure("shape");
  let floor = from;
  return (page.data.data.getTransactions ?? []).map(({ block_height: height, messages }) => {
    if (height < floor || height > to) throw new Failure("shape");
    floor = height;
    let skipped = 0;
    const calls = messages.flatMap(({ value }) => {
      if (value.__typename !== "MsgCall") return [];
      const [path, caller] = [value.pkg_path ?? undefined, value.caller ?? undefined];
      const odd = path === undefined || (caller !== undefined && !isAddress(caller));
      if (odd) skipped += 1;
      return path === undefined ? [] : [{ path, caller: odd ? undefined : caller }];
    });
    return { height, calls, skipped };
  });
}

export interface Reader {
  readonly send: Send;
  readonly indexer: string;
  readonly pace?: (() => Promise<void>) | undefined;
}
// One read under way: where it asks, the rows a page asks, the requests it made and the characters it took.
export interface Reading {
  readonly reader: Reader;
  readonly limit: number;
  readonly isStopped: () => boolean;
  asked: number;
  taken: number;
}

/** A read that has asked nothing yet. */
export const readingOf = (reader: Reader & { readonly page?: number }, isStopped?: () => boolean): Reading => ({
  reader,
  limit: reader.page ?? HISTORY_PAGE,
  isStopped: isStopped ?? (() => false),
  asked: 0,
  taken: 0,
});

/** One request of the read, if its pages are not spent and the pass goes on: the JSON it answers. */
export async function request(reading: Reading, body: IndexerAsk): Promise<unknown> {
  const { reader } = reading;
  if (reading.asked >= HISTORY_MAX_PAGES) throw new Failure("too_many");
  if (reading.isStopped()) throw new Failure("stopped");
  reading.asked += 1;
  await reader.pace?.();
  const init = {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  };
  const text = await fetchText(
    reader.send,
    { url: reader.indexer, init },
    { ms: HISTORY_MS, maxBytes: HISTORY_MAX_BYTES },
  );
  reading.taken += text.length;
  if (reading.taken > HISTORY_READ_BYTES) throw new Failure("too_many");
  return jsonOrFail(text);
}

// The page above `above`: one past the byte cap is asked again with half its rows, down to one.
async function pageOf(reading: Reading, above: number | undefined): Promise<Row[]> {
  for (let size = reading.limit; ; size = Math.ceil(size / 2)) {
    const body = above === undefined ? callsFirst(size) : callsAbove(above, size);
    try {
      return rowsOf(await request(reading, body), above === undefined ? 0 : above + 1);
    } catch (error) {
      if (size === 1 || !(error instanceof Failure) || error.kind !== "too_large") throw error;
    }
  }
}

/**
 * The chain's calls above `above` (from its start without one), a batch at a time to `take` with the height every row up to which is read: a
 * page's rows below its last height, then the next page above them, so a block cut by a page's end is read again whole; a page of one height
 * is read as that block alone; only an empty page ends the read, for an indexer may give fewer rows than asked. A fault throws.
 */
export async function walkCalls(
  reading: Reading,
  above: number | undefined,
  take: (rows: readonly Row[], through: number) => void | Promise<void>,
): Promise<void> {
  for (let from = above; ;) {
    const rows = await pageOf(reading, from);
    const last = rows.at(-1)?.height;
    if (last === undefined) return;
    const whole = rows.filter(({ height }) => height < last);
    from = whole.length > 0 ? last - 1 : last;
    await take(whole.length > 0 ? whole : rowsOf(await request(reading, callsInBlock(last)), last, last), from);
  }
}

interface Tally {
  calls: number;
  readonly callers: Set<string>;
  last: number | null;
  readonly marks: Set<string>;
  readonly recent: Set<string>;
}

// The different addresses of some calls, sorted; a call that names none adds none.
const known = (calls: readonly Call[]): string[] =>
  [...new Set(calls.flatMap(({ caller }) => (caller === undefined ? [] : [caller])))].sort();

// A row's calls added to the realms they aim at: each realm its own calls and callers, and above its height a mark of the row's height and
// the senders of all its calls, so a world's realms give one transaction one mark (F4862).
function count(tallies: ReadonlyMap<string, Tally>, row: Row, sinceOf: (path: string) => number | undefined): void {
  const aimed = new Map<string, { tally: Tally; calls: Call[] }>();
  for (const call of row.calls) {
    const tally = tallies.get(call.path);
    if (tally === undefined) continue;
    const entry = aimed.get(call.path) ?? { tally, calls: [] };
    entry.calls.push(call);
    aimed.set(call.path, entry);
  }
  const mark = `${String(row.height)}:${known(row.calls).join(",")}`;
  for (const [path, { tally, calls }] of aimed) {
    const callers = known(calls);
    tally.calls += calls.length;
    tally.last = Math.max(tally.last ?? 0, row.height);
    for (const caller of callers) tally.callers.add(caller);
    const since = sinceOf(path);
    if (since === undefined || row.height <= since) continue;
    tally.marks.add(mark);
    for (const caller of callers) tally.recent.add(caller);
  }
}

function historyOf(tally: Tally, since: number | undefined): History {
  const counts = { calls: tally.calls, callers: tally.callers.size, lastHeight: tally.last };
  return since === undefined
    ? counts
    : { ...counts, recent: { transactions: [...tally.marks].sort(), callers: [...tally.recent].sort() } };
}

/**
 * Every realm's history in `paths` from one read of the chain's calls: a page's rows below its last height, then the next page above them, so
 * a block cut by a page's end is read again whole; a page of one height is read as that block alone; only an empty page ends the read, for
 * an indexer may give fewer rows than asked. A fault of any request fails the whole read: no realm is counted from half the chain.
 */
export async function readHistories(
  reader: Reader & { readonly page?: number },
  paths: readonly string[],
  hooks: { sinceOf: (path: string) => number | undefined; isStopped?: () => boolean },
): Promise<HistoriesRead> {
  const reading = readingOf(reader, hooks.isStopped);
  const tallies = new Map<string, Tally>(
    paths.map((path) => [path, { calls: 0, callers: new Set(), last: null, marks: new Set(), recent: new Set() }]),
  );
  let skipped = 0;
  const counted = (rows: readonly Row[]): void => {
    for (const row of rows) {
      count(tallies, row, hooks.sinceOf);
      skipped += row.skipped;
    }
  };
  try {
    await walkCalls(reading, undefined, counted);
  } catch (error) {
    return { ok: false, kind: kindOf(error) };
  }
  const histories = new Map([...tallies].map(([path, tally]) => [path, historyOf(tally, hooks.sinceOf(path))]));
  return { ok: true, histories, skipped };
}
