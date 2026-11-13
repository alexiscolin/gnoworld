// The members' gno.land names, read as `@` is typed (D13904): the same reads as the account's pill (mainnet's name, else Onyx's), kept
// by the page's query client, so a room's names are read once and a name read in the pill is not read again. Nothing is asked before a
// mention is begun, and for the first 30 members at most. Each chain's block is asked once, for all of them (C14 of the review).
import { readHeight } from "@gnoworld/chain/node";
import { queryOptions, useQueries } from "@tanstack/react-query";
import { shortAddress } from "@gnoworld/schemas";
import { readName, shownName, type Chain } from "../../lib/chain/names.ts";
import { queryClient, Unread } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { pageFetch } from "../../lib/query/policy.ts";
import { pageNames } from "./pageNames.ts";
import { nameOptions } from "./useReads.ts";

const MOST = 30;

// A chain's block, read once while a mention is typed.
const heightOptions = ({ rpc, chainId }: Chain, enabled: boolean) =>
  queryOptions({
    queryKey: keys.height(chainId),
    enabled,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const read = await readHeight(rpc, { fetch: pageFetch, signal, chainId });
      if (!read.ok) throw new Unread(read, read.failure);
      return read.value.height;
    },
  });

/** The names of those of `members` that have one, by address; read only while `asked`. */
export function useMemberNames(members: readonly string[], asked: boolean): ReadonlyMap<string, string> {
  const { chains } = pageNames(undefined);
  const chainList = [chains.mainnet, chains.onyx];
  const listed = members.slice(0, MOST);
  const heights = useQueries(
    { queries: chainList.map((chain) => heightOptions(chain, asked && listed.length > 0)) },
    queryClient,
  );
  const reads = useQueries(
    {
      queries: listed.flatMap((account) =>
        chainList.map((chain, at) => {
          const height = heights[at]?.data;
          const withHeight: typeof readName = (rpc, found, options) =>
            readName(rpc, { ...found, ...(height === undefined ? {} : { height }) }, options);
          return { ...nameOptions(withHeight, chain, [account, 0]), enabled: asked && height !== undefined };
        }),
      ),
    },
    queryClient,
  );
  const names = new Map<string, string>();
  for (const [at, account] of listed.entries()) {
    const shown = shownName(account, { mainnet: reads[2 * at]?.data, onyx: reads[2 * at + 1]?.data });
    if (shown.text !== shortAddress(account)) names.set(account, shown.text);
  }
  return names;
}
