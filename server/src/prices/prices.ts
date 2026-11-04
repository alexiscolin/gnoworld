// The prices timer (slice 5 part 2, 5l; decision 151): every five minutes, the price and 24 hour change of GNOT, ATONE and
// BTC from CoinGecko's keyless /simple/price, through the server's one way out (net.ts, then the egress proxy), written
// to markets.json for the home page's markets row; with the default universe, its latest block height through the chain
// package, on a node checked to be its chain (D120), so no visitor's browser asks a chain (decision of 2026-10-31). What
// comes back is capped, parsed, checked field by field, only the file's fields written; a failure keeps the last file and is
// logged by its kind, never by what it held. A coin without a price is no token (an unlisted id is left out of the answer).
import { renameSync, unlinkSync, writeFileSync } from "node:fs";
import { readHeight } from "@gnoworld/chain/node";
import type { Failure as ReadFailure, FailureKind } from "@gnoworld/chain/read";
import { Markets, MARKET_SYMBOLS, MarketBlock } from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import { readCapped, send as netSend, type Send } from "@gnoworld/service/net";

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

type Kind =
  | "rate_limited"
  | "status"
  | "too_large"
  | "not_json"
  | "shape"
  | "no_price"
  | "timeout"
  | "request"
  | "write"
  | "other_chain";
class Failure extends Error {
  readonly kind: Kind;
  constructor(kind: Kind) {
    super(kind);
    this.kind = kind;
  }
}

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
  const url = URL.parse(rpc);
  const bare = url?.pathname === "/" && url.search === "" && url.hash === "";
  if (url?.protocol !== "https:" || url.username !== "" || url.password !== "" || !bare)
    throw new RangeError("prices: the rpc is no bare https address");
  return url;
}

const reachedNothing = (error: unknown): boolean => error instanceof Failure && error.kind === "request";

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
const named = (error: unknown): boolean =>
  error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

// The default universe's latest block through the chain package, its node checked to be that universe's chain, the way
// out its transport; then the file's own bounds.
async function readBlock({ url: from, chainId }: { url: URL; chainId: string }, send: Send): Promise<MarketBlock> {
  const read = await readHeight(from.origin, {
    chainId,
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    fetch: (url, init) => send(url, init ?? {}, TIMEOUT_MS),
  });
  if (!read.ok) throw failureOf(read.failure);
  const block = MarketBlock.safeParse({ ...read.value, host: from.hostname });
  if (!block.success) throw new Failure("shape");
  return block.data;
}

export function startPrices(options: Options): Prices {
  const { file, log, send = netSend, now = Date.now, everyMs = EVERY_MS } = options;
  const { universe } = options;
  const node = universe === undefined ? undefined : { url: checkedRpc(universe.rpc), chainId: universe.chainId };
  const temp = `${file}.tmp`;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  // One GET through the way out: the JSON of the body, capped, or the kind of failure.
  async function get(url: string): Promise<unknown> {
    let text: string;
    try {
      const response = await send(url, { method: "GET", headers: { accept: "application/json" } }, TIMEOUT_MS);
      if (response.status === 429) throw new Failure("rate_limited");
      if (!response.ok) throw new Failure("status");
      const capped = await readCapped(response, MAX_BYTES);
      if (capped === undefined) throw new Failure("too_large");
      text = capped;
    } catch (error) {
      if (error instanceof Failure) throw error;
      throw new Failure(named(error) ? "timeout" : "request");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Failure("not_json");
    }
  }

  async function read(): Promise<void> {
    // Both asked at once, each its own failure: the prices' ends the read (the last file stays), the height's only leaves it out.
    const [priced, blocked] = await Promise.allSettled([
      get(URL_ASKED),
      node === undefined ? Promise.resolve(undefined) : readBlock(node, send),
    ]);
    if (stopped) return;
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
    try {
      // Written beside the file and renamed over it: a reader sees the old file or the new one, never half of one.
      writeFileSync(temp, `${JSON.stringify(markets)}\n`, { mode: 0o644 });
      renameSync(temp, file);
    } catch {
      try {
        unlinkSync(temp);
      } catch {
        // Nothing was written, or it is gone already.
      }
      throw new Failure("write");
    }
  }

  // After the read ends: one request in flight. A failure waits as long as a success, but one that reached nothing asked no one.
  const next = (error?: unknown): void => {
    if (!stopped) timer = setTimeout(tick, reachedNothing(error) ? Math.min(RETRY_MS, everyMs) : everyMs);
  };
  function tick(): void {
    read().then(next, (error: unknown) => {
      if (!stopped) log("prices_failed", { error: error instanceof Failure ? error.kind : "shape" });
      next(error);
    });
  }

  tick();
  return {
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
