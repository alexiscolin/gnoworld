// A realm's proposals as a query (5k): kept by chain and realm, so a plate seen again shows them at once, read again quietly once five minutes old,
// and a vote signed on the realm makes them stale (keys.ts's invalidateRealm). A list that did not come whole is no answer: it throws, and the
// last good one stays.
import { queryOptions } from "@tanstack/react-query";
import type { ReadOptions } from "@gnoworld/chain/read";
import { readProposals } from "../chain/proposal.ts";
import { Unread } from "./client.ts";
import { keys } from "./keys.ts";
import { pageFetch } from "./policy.ts";

// How long a realm's proposals are fresh where a view shows them: the chat's card and the world's plate.
const FIVE_MINUTES = 5 * 60_000;

export const proposalsOptions = (rpc: string, realm: string, options?: ReadOptions) =>
  queryOptions({
    queryKey: keys.proposals(rpc, realm),
    staleTime: FIVE_MINUTES,
    queryFn: async ({ signal }) => {
      const read = await readProposals(rpc, realm, { fetch: pageFetch, ...options, signal });
      if (!read.ok) throw new Unread(read, read.failure);
      return read;
    },
  });
