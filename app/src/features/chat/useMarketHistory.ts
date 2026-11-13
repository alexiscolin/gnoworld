// The server's history of the prices (GET /api/markets/history, the last day), restored from the home's old sparklines: one read shared by
// the three tokens' charts. None means no history, and no chart.
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../../lib/query/client.ts";
import { marketsHistoryOptions } from "./marketQueries.ts";

/** The day's prices by symbol, oldest first; `undefined` while it comes, and an empty list when it did not. */
export function useMarketHistory(): ReadonlyMap<string, readonly number[]> | undefined {
  const { data, isError } = useQuery(marketsHistoryOptions, queryClient);
  if (data !== undefined) return new Map(data.tokens.map(({ symbol, usd }) => [symbol, usd]));
  return isError ? new Map() : undefined;
}
