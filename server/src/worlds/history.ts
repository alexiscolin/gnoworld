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

export interface History {
  /** Calls made to the realm, failed ones included. */
  readonly calls: number;
  readonly callers: number;
  /** The height of the last call, or null when there was none. */
  readonly lastHeight: number | null;
}

/** Every realm's history, and the calls left out: one that names no path, or whose caller is no address (counted with none). */
export type HistoriesRead = { ok: true; histories: Map<string, History>; skipped: number } | { ok: false; kind: Kind };

// An empty page is null, not an empty list (onyx-1). A caller is checked where it is read, so one odd call costs that call alone.
const Page = z.object({
  data: z.object({
    getTransactions: z.nullable(
      z.array(
        z.object({
          block_height: ChainCount,
          success: z.optional(z.boolean()),
          messages: z.array(
            z.object({
              value: z.object({
                __typename: z.string(),
                pkg_path: z.nullish(z.string()),
                caller: z.nullish(z.string()),
                func: z.nullish(z.string()),
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
  /** The function it named, as the indexer wrote it: unchecked. */
  readonly func: string | undefined;
}
/** A transaction as the read gives it: its height, whether it succeeded (an answer that does not say counts as failed), its calls. */
export interface Row {
  readonly height: number;
  readonly success: boolean;
  readonly calls: readonly Call[];
  readonly skipped: number;
}

// A page's rows, each at `from` or above and none below the one before it, or at most `to`: the order is what the next page's bound
// stands on. A call with no path is left out and one whose caller is no address keeps no caller, both counted as skipped.
function rowsOf(json: unknown, from: number, to = Number.MAX_SAFE_INTEGER): Row[] {
  const page = Page.safeParse(json);
  if (!page.success) throw new Failure("shape");
  let floor = from;
  return (page.data.data.getTransactions ?? []).map(({ block_height: height, success, messages }) => {
    if (height < floor || height > to) throw new Failure("shape");
    floor = height;
    let skipped = 0;
    const calls = messages.flatMap(({ value }) => {
      if (value.__typename !== "MsgCall") return [];
      const [path, caller] = [value.pkg_path ?? undefined, value.caller ?? undefined];
      const odd = path === undefined || (caller !== undefined && !isAddress(caller));
      if (odd) skipped += 1;
      return path === undefined ? [] : [{ path, caller: odd ? undefined : caller, func: value.func ?? undefined }];
    });
    return { height, success: success === true, calls, skipped };
  });
}

export interface Reader {
  readonly send: Send;
  readonly indexer: string;
  readonly pace?: (() => Promise<void>) | undefined;
  /** Each call's success and function asked too (the rollup's read). */
  readonly rich?: boolean | undefined;
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
    const { rich } = reading.reader;
    const body = above === undefined ? callsFirst(size, rich) : callsAbove(above, size, rich);
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
  const { rich } = reading.reader;
  for (let from = above; ;) {
    const rows = await pageOf(reading, from);
    const last = rows.at(-1)?.height;
    if (last === undefined) return;
    const whole = rows.filter(({ height }) => height < last);
    from = whole.length > 0 ? last - 1 : last;
    await take(whole.length > 0 ? whole : rowsOf(await request(reading, callsInBlock(last, rich)), last, last), from);
  }
}

interface Tally {
  calls: number;
  readonly callers: Set<string>;
  last: number | null;
}

// The different addresses of some calls, sorted; a call that names none adds none.
const known = (calls: readonly Call[]): string[] =>
  [...new Set(calls.flatMap(({ caller }) => (caller === undefined ? [] : [caller])))].sort();

// A row's calls added to the realms they aim at: each realm its own calls and callers.
function count(tallies: ReadonlyMap<string, Tally>, row: Row): void {
  const aimed = new Map<string, { tally: Tally; calls: Call[] }>();
  for (const call of row.calls) {
    const tally = tallies.get(call.path);
    if (tally === undefined) continue;
    const entry = aimed.get(call.path) ?? { tally, calls: [] };
    entry.calls.push(call);
    aimed.set(call.path, entry);
  }
  for (const { tally, calls } of aimed.values()) {
    tally.calls += calls.length;
    tally.last = Math.max(tally.last ?? 0, row.height);
    for (const caller of known(calls)) tally.callers.add(caller);
  }
}

const historyOf = (tally: Tally): History => ({
  calls: tally.calls,
  callers: tally.callers.size,
  lastHeight: tally.last,
});

/**
 * Every realm's history in `paths` from one read of the chain's calls: a page's rows below its last height, then the next page above them, so
 * a block cut by a page's end is read again whole; a page of one height is read as that block alone; only an empty page ends the read, for
 * an indexer may give fewer rows than asked. A fault of any request fails the whole read: no realm is counted from half the chain.
 */
export async function readHistories(
  reader: Reader & { readonly page?: number },
  paths: readonly string[],
  hooks: { isStopped?: () => boolean } = {},
): Promise<HistoriesRead> {
  const tallies = new Map<string, Tally>(paths.map((path) => [path, { calls: 0, callers: new Set(), last: null }]));
  let skipped = 0;
  const counted = (rows: readonly Row[]): void => {
    for (const row of rows) {
      count(tallies, row);
      skipped += row.skipped;
    }
  };
  try {
    await walkCalls(readingOf(reader, hooks.isStopped), undefined, counted);
  } catch (error) {
    return { ok: false, kind: kindOf(error) };
  }
  const histories = new Map([...tallies].map(([path, tally]) => [path, historyOf(tally)]));
  return { ok: true, histories, skipped };
}
