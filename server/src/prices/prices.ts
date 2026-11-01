// The prices timer (slice 5 part 2, 5l; decision 151): every five minutes, the price and 24 hour change of GNOT, ATONE and
// BTC from CoinGecko's keyless /simple/price, through the server's one way out (net.ts, then the egress proxy), written
// to markets.json for the home page's markets row. With an RPC it also reads the default universe's latest block height
// there, the same way out and the same five minutes, so no visitor's browser asks a chain (decision of 2026-10-31). What
// comes back is data: capped, parsed, checked field by field, and only the fields the file holds are written. Any failure keeps the last file and is logged by its kind, never by what
// the answer or the error held. A coin without a price is no token (an unlisted id is simply left out of the answer).
import { Markets, MARKET_SYMBOLS, MarketBlock, StatusAnswer } from "@gnoworld/schemas";
import type { Log } from "../log.ts";
import { Failure, fetchCapped, jsonOf, send as netSend, publicUrl, type Send } from "../net.ts";
import { repeat } from "../repeat.ts";
import { replaceFile } from "../replaceFile.ts";

interface Options {
  file: string;
  log: Log;
  send?: Send;
  /** The default universe's RPC (its data's `rpc`): where the latest block's height is read each tick; none, no height. */
  rpc?: string;
  now?: () => number;
  // The wait after a read ends, whatever came of it; five minutes.
  everyMs?: number;
}

export interface Prices {
  stop: () => void;
}

// CoinGecko asks by id, never by symbol (btc is shared by a dozen tokens).
const IDS = { GNOT: "gno-land", ATONE: "atomone", BTC: "bitcoin" } as const;
const URL_ASKED = `https://api.coingecko.com/api/v3/simple/price?ids=${MARKET_SYMBOLS.map((symbol) => IDS[symbol]).join(",")}&vs_currencies=usd&include_24hr_change=true`;
const TIMEOUT_MS = 10_000;
// A good answer is under 1 KB; 64 KB leaves room and stops a stream that never ends.
export const MAX_BYTES = 64 * 1024;
const EVERY_MS = 300_000;
// A request that reached nothing: in the stack the server starts before the way out, and its first tick finds no proxy.
const RETRY_MS = 15_000;

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

const reachedNothing = (error: unknown): boolean => error instanceof Failure && error.kind === "request";

export function startPrices(options: Options): Prices {
  const { file, log, send = netSend, now = Date.now, everyMs = EVERY_MS } = options;
  const rpc = options.rpc === undefined ? undefined : checkedRpc(options.rpc);

  // One GET through the way out: the JSON of the body, capped, or the kind of failure.
  async function get(url: string): Promise<unknown> {
    const init = { method: "GET", headers: { accept: "application/json" } };
    const bytes = await fetchCapped(send, { url, init }, { ms: TIMEOUT_MS, maxBytes: MAX_BYTES });
    return jsonOf(Buffer.from(bytes).toString("utf8"));
  }

  // The default universe's latest block through its RPC's /status: through Zod, then the file's own bounds.
  async function readBlock(from: URL): Promise<MarketBlock> {
    const status = StatusAnswer.safeParse(await get(`${from.origin}/status`));
    if (!status.success) throw new Failure("shape");
    const { latest_block_height: height, latest_block_time: time } = status.data.result.sync_info;
    const block = MarketBlock.safeParse({ height: Number(height), time, host: from.hostname });
    if (!block.success) throw new Failure("shape");
    return block.data;
  }

  async function read(isStopped: () => boolean): Promise<void> {
    // Both asked at once, each its own failure: the prices' ends the read (the last file stays), the height's only leaves it out.
    const [priced, blocked] = await Promise.allSettled([
      get(URL_ASKED),
      rpc === undefined ? Promise.resolve(undefined) : readBlock(rpc),
    ]);
    if (isStopped()) return;
    if (priced.status === "rejected") throw priced.reason;
    const tokens = tokensOf(priced.value);
    let block: MarketBlock | undefined;
    if (blocked.status === "fulfilled") block = blocked.value;
    else log("height_failed", { error: blocked.reason instanceof Failure ? blocked.reason.kind : "shape" });
    const markets = Markets.parse({
      source: "CoinGecko",
      updated: new Date(now()).toISOString(),
      tokens,
      ...(block === undefined ? {} : { block }),
    });
    if (!replaceFile(file, `${JSON.stringify(markets)}\n`)) throw new Failure("write");
  }

  // After the read ends: one request in flight. A failure waits as long as a success, but one that reached nothing asked no one.
  return repeat({
    pass: read,
    failed: (error) => {
      log("prices_failed", { error: error instanceof Failure ? error.kind : "shape" });
    },
    waitMs: (error) => (reachedNothing(error) ? Math.min(RETRY_MS, everyMs) : everyMs),
  });
}
