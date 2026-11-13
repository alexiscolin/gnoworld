// The prices timer (slice 5 part 2, 5l; decision 151): every five minutes, the price and 24 hour change of GNOT, ATONE and
// BTC from CoinGecko's keyless /simple/price, through the server's one way out (net.ts, then the egress proxy), written
// to markets.json for the home page's markets row; with the default universe, its latest block height through the chain
// package, on a node checked to be its chain (D120), so no visitor's browser asks a chain (decision of 2026-10-31). What
// comes back is capped, parsed, checked field by field, only the file's fields written; a failure keeps the last file and is
// logged by its kind, never by what it held. A coin without a price is no token (an unlisted id is left out of the answer).
import { readHeight } from "@gnoworld/chain/node";
import type { Failure as ReadFailure, FailureKind } from "@gnoworld/chain/read";
import { requestInit } from "@gnoworld/chain/transport";
import { Markets, MARKET_SYMBOLS, MarketBlock, strictUtf8 } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import {
  Failure,
  fetchCapped,
  jsonOrFail,
  publicUrl,
  reachedNothing,
  send as netSend,
  type Kind,
  type Send,
} from "@gnoworld/service/net";
import { repeat, waits } from "../repeat.ts";
import { besideOf, lastFile, replaceFile } from "../replaceFile.ts";
import { makeHistory, type History } from "./history.ts";
import { seedLines } from "./seed.ts";

interface Options {
  file: string;
  log: Log;
  send?: Send;
  /** The default universe (its data's `rpc` and `chainId`): its node, checked to be its chain, gives the latest block's height
   * each tick; none, no height. */
  universe?: { rpc: string; chainId: string };
  now?: () => number;
  // The wait after a read ends, whatever came of it; five minutes.
  everyMs?: number;
}

export interface Prices {
  stop: () => void;
  /** The day's prices so far (8i), from the file beside markets.json. */
  history: History["current"];
}

// CoinGecko asks by id, never by symbol (btc is shared by a dozen tokens).
const IDS = { GNOT: "gno-land", ATONE: "atomone", BTC: "bitcoin" } as const;
const URL_ASKED = `https://api.coingecko.com/api/v3/simple/price?ids=${MARKET_SYMBOLS.map((symbol) => IDS[symbol]).join(",")}&vs_currencies=usd&include_24hr_change=true`;
// One read for the three coins' seven days (seed.ts), once a process, when the history is short.
const URL_SEED = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${MARKET_SYMBOLS.map((symbol) => IDS[symbol]).join(",")}&sparkline=true&per_page=${String(MARKET_SYMBOLS.length)}`;
// Three week-long lines are about 10 KB when spaced by the hour; the page does not say how they are spaced, so room for a five minute spacing.
const SEED_MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 10_000;
// A good answer is under 1 KB; 64 KB leaves room and stops a stream that never ends.
export const MAX_BYTES = 64 * 1024;
const EVERY_MS = 300_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// One coin: its token, or none when it is left out or has no price above zero. A price or a change that is there and is
// not a finite number refuses the whole answer.
function tokenOf(symbol: (typeof MARKET_SYMBOLS)[number], coin: unknown): Markets["tokens"][number] | undefined {
  if (coin === undefined) return undefined;
  if (!isRecord(coin)) throw new Failure("shape");
  const { usd, usd_24h_change: change } = coin;
  if (usd === undefined) return undefined;
  if (!finite(usd) || (change !== undefined && change !== null && !finite(change))) throw new Failure("shape");
  return usd > 0 ? { symbol, usd, change24h: finite(change) ? change : null } : undefined;
}

// The tokens that have a price, in the video's order.
function tokensOf(answer: unknown): Markets["tokens"] {
  if (!isRecord(answer)) throw new Failure("shape");
  const tokens = MARKET_SYMBOLS.flatMap((symbol) => tokenOf(symbol, answer[IDS[symbol]]) ?? []);
  if (tokens.length === 0) throw new Failure("no_price");
  return tokens;
}

// The RPC the height is read from, or a refusal at start: https alone, no user, no path, query or fragment.
function checkedRpc(rpc: string): URL {
  const url = publicUrl(rpc);
  if (url?.pathname !== "/" || url.search !== "" || url.hash !== "")
    throw new RangeError("prices: the rpc is no bare https address");
  return url;
}

// A failed height read, the chain package's kind in this timer's words: a request that reached nothing, a status, a 429.
function failureOf({ kind, status }: ReadFailure): Failure {
  if (kind === "down")
    return new Failure(status === undefined ? "request" : status === 429 ? "rate_limited" : "status");
  const words: Partial<Record<FailureKind, Kind>> = {
    timeout: "timeout",
    "too-big": "too_large",
    "not-json": "not_json",
    "other-chain": "other_chain",
  };
  return new Failure(words[kind] ?? "shape");
}

// The default universe's latest block through the chain package, its node checked to be that universe's chain, the way
// out its transport; then the file's own bounds.
async function readBlock({ url: from, chainId }: { url: URL; chainId: string }, send: Send): Promise<MarketBlock> {
  const read = await readHeight(from.origin, {
    chainId,
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    fetch: (url, init) => send(url, requestInit(init), TIMEOUT_MS),
  });
  if (!read.ok) throw failureOf(read.failure);
  const block = MarketBlock.safeParse({ ...read.value, host: from.hostname });
  if (!block.success) throw new Failure("shape");
  return block.data;
}

// The average seconds between blocks over two reads, from the file's last block and the one just read: none unless the height rose and
// both times parse; a figure the schema refuses (past 600 s) is none too, so it never costs the prices.
function withInterval(block: MarketBlock | undefined, before: MarketBlock | undefined): MarketBlock | undefined {
  if (block === undefined || before === undefined || block.height <= before.height) return block;
  const seconds = (Date.parse(block.time) - Date.parse(before.time)) / 1000 / (block.height - before.height);
  const timed = MarketBlock.safeParse({ ...block, interval: seconds });
  return timed.success ? timed.data : block;
}

// The block of the markets.json this timer last wrote (so a restart has it at once), or none: no file, or one the schema refuses.
const lastBlock = (file: string): MarketBlock | undefined => lastFile(file, Markets)?.block;

export function startPrices(options: Options): Prices {
  const { file, log, send = netSend, now = Date.now, everyMs = EVERY_MS } = options;
  const { universe } = options;
  const node = universe === undefined ? undefined : { url: checkedRpc(universe.rpc), chainId: universe.chainId };
  // Each token's day of prices beside the file (8i), for the markets row's sparklines.
  const history = makeHistory(besideOf(file, "history"), now);

  // One GET through the way out: the JSON of the body, capped, or the kind of failure.
  async function get(url: string, maxBytes = MAX_BYTES): Promise<unknown> {
    const init = { method: "GET", headers: { accept: "application/json" } };
    const text = strictUtf8(await fetchCapped(send, { url, init }, { ms: TIMEOUT_MS, maxBytes }));
    if (text === null) throw new Failure("shape");
    return jsonOrFail(text);
  }

  // The history's one seeding from CoinGecko's own past: once a process, right after a price was read (so the way out works), its failure only
  // logged, the history then as today's.
  let seeded = false;
  async function seed(isStopped: () => boolean): Promise<void> {
    if (seeded || !history.short()) return;
    seeded = true;
    try {
      const lines = seedLines(await get(URL_SEED, SEED_MAX_BYTES), IDS);
      if (!isStopped()) history.seed(lines, now());
    } catch (error) {
      log("prices_history_seed_failed", { error: error instanceof Failure ? error.kind : "shape" });
    }
  }

  async function read(isStopped: () => boolean): Promise<void> {
    // Both asked at once, each its own failure: the prices' ends the read (the last file stays), the height's only leaves it out.
    const [priced, blocked] = await Promise.allSettled([
      get(URL_ASKED),
      node === undefined ? Promise.resolve(undefined) : readBlock(node, send),
    ]);
    if (isStopped()) return;
    if (priced.status === "rejected") throw priced.reason;
    const tokens = tokensOf(priced.value);
    let block: MarketBlock | undefined;
    if (blocked.status === "fulfilled") block = withInterval(blocked.value, lastBlock(file));
    else log("height_failed", { error: blocked.reason instanceof Failure ? blocked.reason.kind : "shape" });
    const markets = Markets.parse({
      source: "CoinGecko",
      updated: new Date(now()).toISOString(),
      tokens,
      ...(block === undefined ? {} : { block }),
    });
    if (!replaceFile(file, `${JSON.stringify(markets)}\n`)) throw new Failure("write");
    await seed(isStopped);
    if (isStopped()) return;
    // The history's file failing keeps markets.json new: the sparklines wait, the prices do not.
    if (!history.add(markets.tokens, Date.parse(markets.updated))) log("prices_failed", { error: "history_write" });
  }

  // After the read ends: one request in flight. A failure waits as long as a success, but one that reached nothing asked no one; as before
  // F4872, one whose cause has no name is asked again soon too, for it is one call.
  const wait = waits(everyMs, (kind) => kind === "request" || reachedNothing(kind));
  const timer = repeat({
    pass: read,
    failed: (error) => {
      log("prices_failed", { error: error instanceof Failure ? error.kind : "shape" });
    },
    waitMs: (error) => wait(error instanceof Failure ? error.kind : undefined),
  });
  return { stop: timer.stop, history: history.current };
}
