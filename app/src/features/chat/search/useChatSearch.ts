// The chat's search as a query (slice 13, C): the pages of hits for one ask, each asked with the cursor of the page before and ended by its
// signal as the words change. The key holds the ask whole: another world, words or filter is another list.
import { useInfiniteQuery } from "@tanstack/react-query";
import { pageSearchApi, type SearchAsk } from "../../../lib/api/search.ts";
import { queryClient } from "../../../lib/query/client.ts";
import { readApi } from "../../../lib/query/api.ts";
import { keys } from "../../../lib/query/keys.ts";

export function useChatSearch(ask: SearchAsk | undefined) {
  return useInfiniteQuery(
    {
      queryKey: keys.search(ask),
      enabled: ask !== undefined,
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam, signal }) => {
        // `enabled` keeps a query with no ask from running.
        if (ask === undefined) throw new Error("no search was asked");
        return readApi(
          (s) => pageSearchApi().search(pageParam === undefined ? ask : { ...ask, before: pageParam }, s),
          signal,
        );
      },
      getNextPageParam: ({ next }) => next ?? undefined,
    },
    queryClient,
  );
}
