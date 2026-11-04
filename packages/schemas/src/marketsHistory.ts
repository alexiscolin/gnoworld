// The prices' history (slice 8, 8i; the markets row's sparklines, frame 6): what the server's prices timer read of each token over the last
// day, one price a read, oldest first, kept beside markets.json and served at GET /api/markets/history. Behind the indexer's door, never the
// barrel: only the markets row's own chunk reads it, after the first screen.
import { MARKET_SYMBOLS, MarketToken } from "./markets.ts";
import { z } from "./zod.ts";

/** The most prices one token's line holds: a day of reads, one each five minutes. */
export const MARKETS_HISTORY_MOST = 288;

/** The most bytes the history weighs: three lines of 288 prices of about 20 characters. */
export const MARKETS_HISTORY_MAX_BYTES = 24 * 1024;

const Line = z.strictObject({
  symbol: z.enum(MARKET_SYMBOLS),
  usd: z.array(MarketToken.shape.usd).check(z.maxLength(MARKETS_HISTORY_MOST)),
});

/** The history: when its last price was read, and each token's line, in the video's order, each once. */
export const MarketsHistory = z.strictObject({
  updated: z.iso.datetime({ offset: true }),
  tokens: z.array(Line).check(
    z.maxLength(MARKET_SYMBOLS.length),
    z.refine((lines) => new Set(lines.map(({ symbol }) => symbol)).size === lines.length, { message: "each once" }),
  ),
});
export type MarketsHistory = z.infer<typeof MarketsHistory>;
