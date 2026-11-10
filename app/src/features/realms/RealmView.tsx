// A realm's page and Try it, the plate's lower half (5h, D375, D566): its page in a card of its own, then its functions to try. The frame, the title and
// the realm's facts are the plate's (routes/plate).
import { gnowebLink } from "../../lib/chain/gnoweb.ts";
import type { ReadOptions } from "@gnoworld/chain/read";
import type { CallPlace } from "./InlineCard.tsx";
import { CallCountsContext } from "./FunctionRow.tsx";
import { PageCard } from "./RealmPageCard.tsx";
import { TryCard } from "./TryCard.tsx";
import { useRead, ListingContext } from "./useCallable.ts";
import type { Realm } from "./useRealm.ts";

export interface RealmViewProps {
  /** The realm, `gno.land/r/demo/dao`. */
  realm: string;
  /** The universe it is read from. */
  chain: { name: string; chainId: string; rpc: string; gnoweb: string; indexer: string };
  /** lib/chain's options, for a test's fetch. */
  options?: ReadOptions;
  /** The realm's page as the plate's adapter read it once (useRealm): the hero's sentence is from it too. */
  state: Realm;
  /** Calls per function from the rollup, shown on its rows in Try it. */
  counts?: ReadonlyMap<string, number>;
}

const NONE: ReadonlyMap<string, number> = new Map();

export function RealmView({ realm, chain, options, state, counts = NONE }: RealmViewProps) {
  const link = gnowebLink(chain.gnoweb, realm);
  const place: CallPlace = { realm, chain, options };
  const listing = useRead({ rpc: chain.rpc, realm, options });
  return (
    <ListingContext value={listing}>
      <PageCard realm={realm} chain={chain} state={state} link={link} place={place} />
      <CallCountsContext value={counts}>
        <TryCard realm={realm} chain={chain} options={options} />
      </CallCountsContext>
    </ListingContext>
  );
}
