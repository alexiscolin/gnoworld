// The prices timer (slice 5 part 2, 5l; decision 151): every five minutes, the price and 24 hour change of GNOT, ATONE and
// BTC from CoinGecko's keyless /simple/price, through the server's one way out (net.ts, then the egress proxy), written
// to markets.json for the home page's markets row. What comes back is data: capped, parsed, checked field by field, and
// only the fields the file holds are written. Any failure keeps the last file and is logged by its kind, never by what
// the answer or the error held. A coin without a price is no token (an unlisted id is simply left out of the answer).
import { renameSync, unlinkSync, writeFileSync } from "node:fs";
import { Markets, MARKET_SYMBOLS } from "@gnoworld/schemas";
import type { Log } from "../log.ts";
import { send as netSend } from "../net.ts";

type Send = (url: string, init: RequestInit, ms: number) => Promise<Response>;

interface Options {
  file: string;
  log: Log;
  send?: Send;
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

type Kind =
  "rate_limited" | "status" | "too_large" | "not_json" | "shape" | "no_price" | "timeout" | "request" | "write";
class Failure extends Error {
  readonly kind: Kind;
  constructor(kind: Kind) {
    super(kind);
    this.kind = kind;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// The body, at most MAX_BYTES of it; a longer one is cut off and refused.
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part: { done: boolean; value?: Uint8Array } = await reader.read();
    if (part.done || part.value === undefined) break;
    size += part.value.byteLength;
    if (size > MAX_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // Cut off already, or failing to be: the answer is refused either way.
        throw new Failure("too_large");
      }
      throw new Failure("too_large");
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

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

const named = (error: unknown): boolean =>
  error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

export function startPrices(options: Options): Prices {
  const { file, log, send = netSend, now = Date.now, everyMs = EVERY_MS } = options;
  const temp = `${file}.tmp`;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  async function read(): Promise<void> {
    let text: string;
    try {
      const response = await send(URL_ASKED, { method: "GET", headers: { accept: "application/json" } }, TIMEOUT_MS);
      if (response.status === 429) throw new Failure("rate_limited");
      if (!response.ok) throw new Failure("status");
      text = await readCapped(response);
    } catch (error) {
      if (error instanceof Failure) throw error;
      throw new Failure(named(error) ? "timeout" : "request");
    }
    if (stopped) return;
    let answer: unknown;
    try {
      answer = JSON.parse(text);
    } catch {
      throw new Failure("not_json");
    }
    const markets = Markets.parse({
      source: "CoinGecko",
      updated: new Date(now()).toISOString(),
      tokens: tokensOf(answer),
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

  // After the read ends, answered or not: one request in flight, and a failure waits as long as a success.
  const next = (): void => {
    if (!stopped) timer = setTimeout(tick, everyMs);
  };
  function tick(): void {
    read().then(next, (error: unknown) => {
      if (!stopped) log("prices_failed", { error: error instanceof Failure ? error.kind : "shape" });
      next();
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
