// The history's first day from CoinGecko's own past (the markets row's sparklines, so they show a curve from the first pass instead of a line
// of one to three points): one read of /coins/markets with sparkline=true gives each coin's price over the last 7 days as
// `sparkline_in_7d.price` (https://docs.coingecko.com/reference/coins-markets, read 2026-11-07: "Sparkline price data for the last 7 days"; the page
// states neither the points' spacing nor their number, nor a limit, nor an attribution). The points are taken as evenly spaced over the seven days,
// and the last day is resampled to the history's own interval, MARKETS_HISTORY_MOST prices a day, by linear interpolation, oldest first.
import { MARKETS_HISTORY_MOST } from "@gnoworld/schemas/indexer";
import { MarketToken } from "@gnoworld/schemas";
import { z } from "zod";

// The seven days' prices of one coin, a day of them at most a week's worth at the history's own interval; a coin without a sparkline is left out.
const Coins = z.array(
  z.object({
    id: z.string(),
    sparkline_in_7d: z.nullish(z.object({ price: z.array(MarketToken.shape.usd).max(MARKETS_HISTORY_MOST * 7) })),
  }),
);

/** A week of evenly spaced prices, its last day as `MARKETS_HISTORY_MOST` prices ending at its last; none under a week of points. */
function lastDay(week: readonly number[]): number[] {
  const last = week.length - 1;
  if (week.length < 7) return [];
  return Array.from({ length: MARKETS_HISTORY_MOST }, (_, k) => {
    const at = last - ((MARKETS_HISTORY_MOST - 1 - k) / (MARKETS_HISTORY_MOST - 1)) * (last / 7);
    const low = Math.floor(at);
    const from = week[low] ?? 0;
    return from + ((week[Math.min(low + 1, last)] ?? from) - from) * (at - low);
  });
}

/** The lines of the coins asked for (`symbols` by CoinGecko id) that the answer holds a week for; a malformed answer throws. */
export function seedLines<S extends string>(
  answer: unknown,
  symbols: Record<S, string>,
): { symbol: S; usd: number[] }[] {
  const coins = Coins.parse(answer);
  return (Object.keys(symbols) as S[]).flatMap((symbol) => {
    const week = coins.find(({ id }) => id === symbols[symbol])?.sparkline_in_7d?.price ?? [];
    const usd = lastDay(week);
    return usd.length === 0 ? [] : [{ symbol, usd }];
  });
}
