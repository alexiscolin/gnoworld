// The token worlds' pass (slice 13), last of the worlds job: grc20's events above the height kept, a page at a time, each checked on its own,
// the transfers dated by their blocks (blockDays.ts) and replayed into the database (tokenStore.ts). A fault is logged by its kind and keeps
// every batch before it; no visitor ever reaches the indexer, and no eval is made.
import { tokenEventsAbove, tokenEventsInBlock, tokenHeightAbove } from "@gnoworld/chain/tokenAsks";
import {
  ChainCount,
  EventRow,
  NewTokenAttrs,
  TOKEN_PACKAGE,
  TokenEventsPage,
  tokenIdOf,
  TransferAttrs,
} from "@gnoworld/schemas/indexer";
import type { Log } from "@gnoworld/service/log";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { anchorHolds, daysOf, timesOf } from "./blockDays.ts";
import { readingOf, request, type Reader, type Reading } from "./history.ts";
import { Failure, kindOf, type Kind, type Send } from "./remote.ts";
import { tokenStore, type TokenEvent, type TokenStore, type TokenTx } from "./tokenStore.ts";

/** The transactions a page asks, the most pages and characters one pass reads: past them it keeps what it replayed and goes on next time. */
const TOKEN_PAGE = 500;
export const TOKEN_PAGES = 20;
const TOKEN_READ_BYTES = 4 * 1024 * 1024;

// An event's attributes by key, the first of a key winning.
function attributesOf(attrs: readonly { key: string; value: string }[] | undefined): Record<string, string> {
  const given = new Map<string, string>();
  for (const { key, value } of attrs ?? []) if (!given.has(key)) given.set(key, value);
  return Object.fromEntries(given);
}

// One event of a page: a token event checked, `undefined` for any other (not grc20's, or of no kind we replay), `"skipped"` for one that is
// no event at all. An event of a token whose attributes fail is `bad`, so its token is no longer believed.
function eventOf(raw: unknown): TokenEvent | undefined | "skipped" {
  const row = EventRow.safeParse(raw);
  if (!row.success) return "skipped";
  const { type, pkg_path: from, attrs } = row.data;
  if (from !== TOKEN_PACKAGE || (type !== "Transfer" && type !== "NewToken")) return undefined;
  const attributes = attributesOf(attrs);
  if (type === "NewToken") {
    const made = NewTokenAttrs.safeParse(attributes);
    // An id the chain makes under `realm.Sub` names no realm path: counted and logged, never replayed.
    return made.success && tokenIdOf(made.data.token) !== undefined ? { kind: "new", ...made.data } : "skipped";
  }
  const moved = TransferAttrs.safeParse(attributes);
  return moved.success
    ? { kind: "transfer", ...moved.data, value: BigInt(moved.data.value) }
    : { kind: "bad", token: attributes["token"] ?? "" };
}

/** A page's transactions with their token events, each at `from` or above and none below the one before it, or at most `to`; and how many
 * events were no events. */
export function txsOf(json: unknown, from: number, to = Number.MAX_SAFE_INTEGER): { txs: TokenTx[]; skipped: number } {
  const page = TokenEventsPage.safeParse(json);
  if (!page.success) throw new Failure("shape");
  let floor = from;
  let skipped = 0;
  const txs = (page.data.data.getTransactions ?? []).map(({ block_height: height, response }) => {
    if (height < floor || height > to) throw new Failure("shape");
    floor = height;
    const events = (response.events ?? []).map(eventOf);
    skipped += events.filter((event) => event === "skipped").length;
    return { height, events: events.filter((event) => event !== undefined && event !== "skipped") };
  });
  return { txs, skipped };
}

// The page above `above`: one past the byte cap is asked again with half its rows, down to one; a row too large even alone is `poisoned`,
// with the height it sits at.
async function pageOf(
  reading: Reading,
  above: number | undefined,
): Promise<ReturnType<typeof txsOf> | { poisoned: number }> {
  for (let size = reading.limit; ; size = Math.ceil(size / 2)) {
    try {
      return txsOf(
        await request(reading, tokenEventsAbove(TOKEN_PACKAGE, above, size)),
        above === undefined ? 0 : above + 1,
      );
    } catch (error) {
      if (!(error instanceof Failure) || error.kind !== "too_large") throw error;
      if (size === 1) return { poisoned: await heightAfter(reading, above) };
    }
  }
}

// The height of the first transaction with a token event above `above`, read alone.
async function heightAfter(reading: Reading, above: number | undefined): Promise<number> {
  const found = z
    .object({ data: z.object({ getTransactions: z.nullable(z.array(z.object({ block_height: ChainCount }))) }) })
    .safeParse(await request(reading, tokenHeightAbove(TOKEN_PACKAGE, above)));
  const height = found.success ? found.data.data.getTransactions?.[0]?.block_height : undefined;
  if (height === undefined || height <= (above ?? -1)) throw new Failure("too_large");
  return height;
}

/** What a read of the events found and left: how many events were no events, how many heights could not be read, and whether a cap ended it. */
async function walkTokens(
  reading: Reading,
  above: number | undefined,
  {
    take,
    step,
  }: { take: (txs: readonly TokenTx[], through: number) => Promise<void>; step: (through: number) => void },
): Promise<{ skipped: number; stepped: number; capped: boolean }> {
  let skipped = 0;
  let stepped = 0;
  for (let from = above, pages = 0; ; pages += 1) {
    if (pages >= TOKEN_PAGES || reading.taken > TOKEN_READ_BYTES) return { skipped, stepped, capped: true };
    const page = await pageOf(reading, from);
    if ("poisoned" in page) {
      from = page.poisoned;
      stepped += 1;
      step(from);
      continue;
    }
    skipped += page.skipped;
    const last = page.txs.at(-1)?.height;
    if (last === undefined) return { skipped, stepped, capped: false };
    const whole = page.txs.filter(({ height }) => height < last);
    from = whole.length > 0 ? last - 1 : last;
    if (whole.length > 0) await take(whole, from);
    else {
      const block = txsOf(await request(reading, tokenEventsInBlock(TOKEN_PACKAGE, last)), last, last);
      skipped += block.skipped;
      await take(block.txs, from);
    }
  }
}

/** What a pass of the tokens reads and writes with. */
export interface TokenPass {
  readonly db: DatabaseSync;
  /** The store the server's route reads too, so a reset clears its answers as well; made from `db` when none. */
  readonly store?: TokenStore | undefined;
  readonly log: Log;
  readonly reader: Reader & { readonly page?: number };
  readonly universe: string;
  readonly isStopped: () => boolean;
  readonly now: () => number;
}

// A batch dated and replayed in one transaction.
const replayed =
  (reading: Reading, store: TokenStore, now: () => number) =>
  async (txs: readonly TokenTx[], through: number): Promise<void> => {
    // The transfers' blocks, and the batch's last block: what a restarted chain is checked against, even for a batch with no transfer.
    const last = txs.at(-1)?.height;
    const heights = [
      ...new Set([
        ...txs.flatMap(({ height, events }) => (events.some(({ kind }) => kind === "transfer") ? [height] : [])),
        ...(last === undefined ? [] : [last]),
      ]),
    ].sort((a, b) => a - b);
    const dated = await daysOf(heights, (asked) => timesOf(reading, asked));
    try {
      store.add({ txs, dated, through, now: now() });
    } catch (error) {
      throw error instanceof Failure ? error : new Failure("write");
    }
  };

/** One pass: the events above the height kept, replayed. A fault ends it and keeps every batch before it. */
export async function readTokens(pass: TokenPass): Promise<{ ok: true } | { ok: false; kind: Kind }> {
  let store: TokenStore;
  try {
    store = pass.store ?? tokenStore(pass.db, pass.universe);
  } catch {
    return { ok: false, kind: "write" };
  }
  const reading = readingOf({ ...pass.reader, page: pass.reader.page ?? TOKEN_PAGE }, pass.isStopped);
  try {
    const anchor = store.anchor();
    if (anchor !== undefined && !(await anchorHolds(reading, anchor))) store.reset();
    const { skipped, stepped, capped } = await walkTokens(reading, store.height(), {
      take: replayed(reading, store, pass.now),
      step: store.unsure,
    });
    if (stepped > 0) pass.log("token_block_too_large", { error: "too_large" });
    if (skipped > 0) pass.log("token_events_skipped", { error: "shape" });
    if (capped) pass.log("token_read_capped", { error: "capped" });
    return { ok: true };
  } catch (error) {
    return { ok: false, kind: kindOf(error) };
  }
}

/** The pass the rollup's pass ends with: a fault is logged by its kind and the next pass tries again. */
export async function runTokens(pass: {
  readonly rollup?: { readonly db: DatabaseSync } | undefined;
  readonly tokens?: TokenStore | undefined;
  readonly log: Log;
  readonly send: Send;
  readonly universe: { readonly id: string; readonly indexer: string };
  readonly pace: () => Promise<void>;
  readonly isStopped: () => boolean;
  readonly now: () => number;
}): Promise<void> {
  const { rollup, universe, log, isStopped } = pass;
  if (rollup === undefined || isStopped()) return;
  const reader = { send: pass.send, indexer: universe.indexer, pace: pass.pace };
  const read = await readTokens({
    db: rollup.db,
    store: pass.tokens,
    log,
    reader,
    universe: universe.id,
    isStopped,
    now: pass.now,
  });
  if (!read.ok) log("worlds_tokens_failed", { error: read.kind });
}
