// A call's detail as a query: a transaction never changes once in a block, so a read is kept for good and never asked again, unless it has no time yet; a failed one is
// asked again only by the reader's own "Try again" (a hash the indexer does not hold yet answers the same for a few seconds).
import { queryOptions } from "@tanstack/react-query";
import { pageCallsApi } from "../../lib/api/calls.ts";
import { readApi } from "../../lib/query/api.ts";
import { keys } from "../../lib/query/keys.ts";

/** How long a read of a detail without its block's time stands: the server keeps such a detail a few seconds, the indexer not having the block yet. */
export const TIMELESS_MS = 5_000;

export const callOptions = (hash: string, index: number) =>
  queryOptions({
    queryKey: keys.call(hash, index),
    queryFn: ({ signal }) => readApi((s) => pageCallsApi().read(hash, index, s), signal),
    staleTime: ({ state }) => (state.data?.time === null ? TIMELESS_MS : Number.POSITIVE_INFINITY),
    retry: false,
  });
