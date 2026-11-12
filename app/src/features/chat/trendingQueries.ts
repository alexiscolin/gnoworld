// The /trending card's read: the server's ranking of the last 7 days (GET /api/trending), one request shared by every card and kept
// by the client's own rules. A ranking that did not come whole throws, so the last good one stays.
import { Trending, TRENDING_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { queryOptions } from "@tanstack/react-query";
import { keys } from "../../lib/query/keys.ts";
import { readPageFile } from "../../lib/query/siteFile.ts";

export const trendingOptions = queryOptions({
  queryKey: keys.trending(),
  queryFn: async ({ signal }) => {
    return readPageFile("/api/trending", Trending, { maxBytes: TRENDING_MAX_BYTES, signal });
  },
});
