// What the chains give of an account's name, read again when the account or the universe's chains change or `again` does (a registration ran).
// One query a chain, kept by chain, account and `again`: a registration's new read shows the old name until its own comes.
import { queryOptions, useQueries } from "@tanstack/react-query";
import type { ReadOptions } from "@gnoworld/chain/read";
import type { Chain, readName, Named } from "../../lib/chain/names.ts";
import { queryClient, Unread } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { pageFetch } from "../../lib/query/policy.ts";

/** What was read for one account: a chain with no answer, or a failed one, is not here. */
export interface Reads {
  mainnet?: Named | undefined;
  onyx?: Named | undefined;
}

// A name that could not be read is no answer: the query keeps the last name and says nothing of the failure.
const nameOptions = (read: typeof readName, { rpc, chainId }: Chain, [account, again]: readonly [string, number]) =>
  queryOptions<Named>({
    queryKey: keys.name(chainId, account, again),
    // The old name of the same account only: another account never shows this one's.
    placeholderData: (before, query) => (query?.queryKey[2] === account ? before : undefined),
    queryFn: async ({ signal }): Promise<Named> => {
      const options: ReadOptions = { fetch: pageFetch, signal };
      const answer = await read(rpc, { chainId, account }, options);
      if (!answer.ok) throw new Unread(answer, answer.failure);
      return answer.value;
    },
  });

export function useReads(
  { account, chains, read }: { account: string; chains: { mainnet: Chain; onyx: Chain }; read: typeof readName },
  again: number,
): Reads {
  const [mainnet, onyx] = useQueries(
    {
      queries: [nameOptions(read, chains.mainnet, [account, again]), nameOptions(read, chains.onyx, [account, again])],
    },
    queryClient,
  );
  return { mainnet: mainnet.data, onyx: onyx.data };
}
