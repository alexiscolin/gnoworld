// The network's line of health: the transactions of each UTC day and the accounts that sent them, from the indexer, kept in the database
// and answered from memory at GET /api/network, never per request. A pass reads the transactions above the height it kept (the first,
// from the first block of the day 13 days back, found by bisection), a page of 1,000 at a time, at most 20 pages and 4 MB; each is one
// transaction and one account (its first message's sender), dated by its block (blockDays.ts). The addresses are counted and kept as long as
// the days shown, nothing serves them. ponytail: a block of 1,000 transactions or more counts its first 1,000 only, the pass moves past
// the rest; a multisig's other signers are not counted.
import { blockTimes, tipAsk, txsAbove } from "@gnoworld/chain/asks";
import { isAddress } from "@gnoworld/core";
import { ChainCount, NETWORK_DAYS, NetworkAnswer, TipAnswer } from "@gnoworld/schemas/indexer";
import type { Log } from "@gnoworld/service/log";
import type { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { daysOf, parseBlockTimes, timesOf } from "./blockDays.ts";
import { lastRoutes } from "./lastRoutes.ts";
import { readingOf, request, type Reading } from "./history.ts";
import { Failure, kindOf, pacer, type Send } from "./remote.ts";
import { answerOf, dayOf, DAY_MS, keep, prune, type Tx } from "./networkStore.ts";

/** The transactions a page asks, the pages a pass reads and the characters it takes: a chain a hundred times busier keeps the days it has. */
const NETWORK_PAGE = 1_000;
export const NETWORK_PAGES = 20;
const NETWORK_READ_BYTES = 4 * 1024 * 1024;

// An empty page is null (onyx-1). A row is checked alone, so one odd row costs that row.
const Page = z.object({
  data: z.object({ getTransactions: z.nullable(z.array(z.unknown())) }),
  errors: z.optional(z.never()),
});
const Height = z.object({ block_height: ChainCount });
const Row = z.object({
  block_height: ChainCount,
  messages: z.array(
    z.object({
      value: z.object({
        caller: z.nullish(z.string()),
        creator: z.nullish(z.string()),
        from_address: z.nullish(z.string()),
      }),
    }),
  ),
});

// The transactions of a page that are whole, and how many were not.
function txsOf(rows: readonly unknown[]): { txs: Tx[]; skipped: number } {
  const txs = rows.flatMap((row): Tx[] => {
    const parsed = Row.safeParse(row);
    if (!parsed.success) return [];
    const value = parsed.data.messages[0]?.value;
    const sender = value?.caller ?? value?.creator ?? value?.from_address ?? "";
    return [{ height: parsed.data.block_height, sender: isAddress(sender) ? sender : undefined }];
  });
  return { txs, skipped: rows.length - txs.length };
}

export interface NetworkPass {
  readonly send: Send;
  readonly indexer: string;
  readonly universe: string;
  readonly db: DatabaseSync;
  readonly log: Log;
  readonly now: () => number;
  readonly pace: () => Promise<void>;
  readonly isStopped: () => boolean;
  /** The transactions a page asks, NETWORK_PAGE unless a test says less. */
  readonly page?: number;
}

// The height before the first block of `day`, by bisection on the blocks' times: the pass reads above it. A chain whose tip is before the
// day is read from its tip.
async function heightBefore(reading: Reading, tip: number, day: string): Promise<number> {
  const dayAt = async (height: number): Promise<string> =>
    (parseBlockTimes(await request(reading, blockTimes([height])), [height]).get(height) ?? "").slice(0, 10);
  if ((await dayAt(tip)) < day) return tip;
  let [low, high] = [0, tip];
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((await dayAt(middle)) < day) low = middle;
    else high = middle;
  }
  return low;
}

// The height the pass reads above: the one kept, else the one before the first block of the first day shown. Another universe's rows go.
async function startOf(pass: NetworkPass, reading: Reading, tip: number): Promise<number> {
  const { db, universe } = pass;
  if (db.prepare("SELECT 1 FROM network_state WHERE universe <> ?").get(universe) !== undefined)
    for (const table of ["network_state", "network_days", "network_day_accounts"]) db.exec(`DELETE FROM ${table}`);
  const kept = db.prepare("SELECT height FROM network_state WHERE universe = ?").get(universe)?.["height"];
  return typeof kept === "number" ? kept : heightBefore(reading, tip, dayOf(pass.now() - (NETWORK_DAYS - 1) * DAY_MS));
}

// What a page takes: a full page may end inside a block, so its last block is left for the next page, unless the page holds that block
// alone; the height it reads through is that, or the tip once a page is not full.
function takenOf(txs: readonly Tx[], full: boolean, tip: number): { taken: readonly Tx[]; through: number } {
  const last = txs.at(-1)?.height;
  if (!full || last === undefined) return { taken: txs, through: Math.max(tip, last ?? 0) };
  const split = txs.some(({ height }) => height < last);
  return split
    ? { taken: txs.filter(({ height }) => height < last), through: last - 1 }
    : { taken: txs, through: last };
}

// One page above `from.above`, dated and kept, and whether it was full.
async function pageAbove(pass: NetworkPass, reading: Reading, from: { above: number; tip: number }) {
  const page = Page.safeParse(await request(reading, txsAbove(from.above, reading.limit)));
  if (!page.success) throw new Failure("shape");
  const rows = page.data.data.getTransactions ?? [];
  const { txs, skipped } = txsOf(rows);
  if (skipped > 0) pass.log("network_rows_skipped", { error: "shape" });
  const full = rows.length >= reading.limit;
  // A full page of rows that all fail would stop every pass: its last readable height is stepped past, and logged.
  if (full && txs.length === 0) {
    const through = Math.max(...rows.map((row) => Height.safeParse(row).data?.block_height ?? 0));
    if (through <= from.above) throw new Failure("shape");
    pass.log("network_page_skipped", { error: "shape" });
    keep(pass.db, pass.universe, { days: new Map(), txs: [], through });
    return { through, full };
  }
  const { taken, through } = takenOf(txs, full, from.tip);
  const dated = await daysOf([...new Set(taken.map(({ height }) => height))], (heights) => timesOf(reading, heights));
  keep(pass.db, pass.universe, { days: dated.days, txs: taken, through });
  return { through, full };
}

/** One pass: the transactions above the kept height read and counted, then the answer; a Failure ends it, the pages read so far kept. */
export async function networkPass(pass: NetworkPass): Promise<NetworkAnswer> {
  const { log } = pass;
  const reader = { send: pass.send, indexer: pass.indexer, pace: pass.pace, page: pass.page ?? NETWORK_PAGE };
  const reading = readingOf(reader, pass.isStopped);
  const tipRead = TipAnswer.safeParse(await request(reading, tipAsk()));
  if (!tipRead.success) throw new Failure("shape");
  const tip = tipRead.data.data.latestBlockHeight;
  let above = await startOf(pass, reading, tip);
  for (let pages = 0; ; pages += 1) {
    if (pages === NETWORK_PAGES || reading.taken > NETWORK_READ_BYTES) {
      log("network_read_capped");
      break;
    }
    const read = await pageAbove(pass, reading, { above, tip });
    above = read.through;
    if (!read.full) break;
  }
  prune(pass.db, pass.now());
  const time = parseBlockTimes(await request(reading, blockTimes([tip])), [tip]).get(tip);
  const answer = time === undefined ? undefined : answerOf(pass, { height: tip, time });
  if (answer === undefined) throw new Failure("shape");
  return answer;
}

/** The pass a worlds pass ends with: its answer told, a fault logged by its kind and the next pass trying again. */
export async function runNetwork(settings: {
  readonly send: Send;
  readonly universe: { readonly id: string; readonly indexer: string };
  readonly log: Log;
  readonly now: () => number;
  readonly wait: (ms: number) => Promise<void>;
  readonly pauseMs: number;
  readonly isStopped: () => boolean;
  readonly network?: { readonly db: DatabaseSync; readonly told: (answer: NetworkAnswer) => void } | undefined;
}): Promise<void> {
  const { network, universe, log, now } = settings;
  if (network === undefined || settings.isStopped()) return;
  try {
    const pace = pacer(settings.wait, settings.pauseMs, now);
    network.told(
      await networkPass({ ...settings, indexer: universe.indexer, universe: universe.id, db: network.db, pace }),
    );
  } catch (error) {
    log("network_failed", { error: kindOf(error) });
  }
}

/** GET / answers the last pass's line, public for a minute; a 404 while the job has made none. */
export const networkRoutes = (last: () => NetworkAnswer | undefined): Hono => lastRoutes(last);
