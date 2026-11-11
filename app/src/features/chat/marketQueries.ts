// The market card's two reads as queries (D13973): the prices (/markets.json) and the day's history, each one request shared by every card
// and kept fresh by the client's own rules, a failure never kept for the page's life.
import { readSiteFile } from "@gnoworld/chain/transport";
import { MARKETS_HISTORY_MAX_BYTES, MarketsHistory } from "@gnoworld/schemas/indexer";
import { queryOptions } from "@tanstack/react-query";
import { readMarkets } from "../../lib/api/markets.ts";
import { Unread } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { pageFetch } from "../../lib/query/policy.ts";

/** The prices; a read that did not come whole throws its `MarketsRead` (why) in an `Unread`. */
export const marketsOptions = queryOptions({
  queryKey: keys.markets(),
  queryFn: async ({ signal }) => {
    const read = await readMarkets(pageFetch, { signal });
    if (!read.ok) throw new Unread(read);
    return read.markets;
  },
});

/** The day's prices by token; none means no chart. */
export const marketsHistoryOptions = queryOptions({
  queryKey: keys.marketsHistory(),
  queryFn: async ({ signal }) => {
    const history = await readSiteFile("/api/markets/history", MarketsHistory, {
      maxBytes: MARKETS_HISTORY_MAX_BYTES,
      fetch: pageFetch,
      signal,
    });
    if (history === undefined) throw new Unread(undefined);
    return history;
  },
});
