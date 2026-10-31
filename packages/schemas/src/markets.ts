// The file the server's prices timer writes and the home page reads (ADR-0002 §6, "Prices"; slice 5 part 2, 5l):
// where the prices come from, when they were read, and the tokens that have a price, in the video's order.
import { z } from "./zod.ts";

/** The tokens the markets row shows, in the video's order. */
export const MARKET_SYMBOLS = ["GNOT", "ATONE", "BTC"] as const;

/** A token's price in dollars (a trillionth to a billion) and its 24 hour change in percent (a fall of at most 100, a rise of a million), null when the source has none. */
export const MarketToken = z.strictObject({
  symbol: z.enum(MARKET_SYMBOLS),
  usd: z.number().check(
    z.refine((usd) => usd > 0, { message: "above zero" }),
    z.gte(1e-12),
    z.lte(1e9),
  ),
  change24h: z.nullable(z.number().check(z.gte(-100), z.lte(1e6))),
});
export type MarketToken = z.infer<typeof MarketToken>;

/** The default universe's latest block as its RPC gave it (the server reads it with the prices): its height (1 to a trillion, a whole number), its own time and the host it was read from. */
export const MarketBlock = z.strictObject({
  // Not z.int(): its class would sit in the store's chunk, which the first screen loads (F2976; indexer.ts).
  height: z.number().check(z.refine(Number.isSafeInteger, { message: "a whole number" }), z.gte(1), z.lte(1e12)),
  // At most 40 characters: RFC 3339 allows any run of fractional digits, and 20 KB of them would put the file past the browser's 16 KB.
  time: z.iso.datetime({ offset: true }).check(z.maxLength(40)),
  host: z.string().check(z.maxLength(253), z.regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/)),
});
export type MarketBlock = z.infer<typeof MarketBlock>;

/** markets.json: the source, the time of the read, the tokens that have a price (none, one to three), never twice, and the block height when it could be read. */
export const Markets = z.strictObject({
  source: z.literal("CoinGecko"),
  block: z.optional(MarketBlock),
  updated: z.iso.datetime({ offset: true }),
  tokens: z.array(MarketToken).check(
    z.maxLength(MARKET_SYMBOLS.length),
    z.refine(
      (tokens) => {
        const places = tokens.map((token) => MARKET_SYMBOLS.indexOf(token.symbol));
        return places.every((place, index) => index === 0 || place > (places[index - 1] ?? -1));
      },
      { message: "in the video's order, each once" },
    ),
  ),
});
export type Markets = z.infer<typeof Markets>;
