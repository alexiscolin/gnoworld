// A realm's facts from the public indexer (5k): kept by indexer and realm, so a place seen again draws them at once and reads them again quietly,
// and the plate's standing and the realm's card share one request (D530). A read that fails is a state of its own, never a blank, and does not
// touch the page's read (RealmView): each is read on its own.
import type { RealmFactsValue } from "@gnoworld/schemas/indexer";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ChainRead, ReadOptions } from "@gnoworld/chain/read";
import { readRealmFacts } from "../../lib/chain/indexer.ts";
import { isUnread, queryClient, Unread } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { pageFetch } from "../../lib/query/policy.ts";

type Facts = ChainRead<RealmFactsValue>;

/** The facts of `realm` at `indexer` as a query (warm.ts asks them ahead); a read that failed is no answer, and the last good one stays. */
export const realmFacts = (indexer: string, realm: string, options?: ReadOptions) =>
  queryOptions({
    queryKey: keys.facts(indexer, realm),
    queryFn: async ({ signal }) => {
      const read = await readRealmFacts(indexer, realm, { fetch: pageFetch, ...options, signal });
      if (!read.ok) throw new Unread(read, read.failure);
      return read;
    },
  });

/** The facts of `realm` at `indexer`: the kept ones at once, then the fresh ones; none while a first read comes. */
export function useRealmFacts(indexer: string, realm: string, options?: ReadOptions): Facts | undefined {
  const { data, error } = useQuery(realmFacts(indexer, realm, options), queryClient);
  return data ?? (isUnread<Facts>(error) ? error.read : undefined);
}
