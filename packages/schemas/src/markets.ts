// The file the server's prices timer writes and the home page reads (ADR-0002 §6, "Prices"; slice 5 part 2, 5l):
// where the prices come from, when they were read, and the tokens that have a price, in the video's order.
import { z } from "./zod.ts";

/** The tokens the markets row shows, in the video's order. */
export const MARKET_SYMBOLS = ["GNOT", "ATONE", "BTC"] as const;

/** A token's price in dollars (above zero, finite) and its 24 hour change in percent, null when the source has none. */
export const MarketToken = z.strictObject({
  symbol: z.enum(MARKET_SYMBOLS),
  usd: z.number().check(z.refine((usd) => usd > 0, { message: "above zero" })),
  change24h: z.nullable(z.number()),
});
export type MarketToken = z.infer<typeof MarketToken>;

/** markets.json: the source, the time of the read, and the tokens that have a price (none, one to three), never twice. */
export const Markets = z.strictObject({
  source: z.literal("CoinGecko"),
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
