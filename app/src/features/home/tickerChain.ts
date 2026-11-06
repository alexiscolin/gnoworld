// The chain's deploys in the home's strip (slice 9g): the newest of this page's universe first, still six at most, each a link to the realm's own page.
import { short, stripped } from "../../lib/chainText.ts";
import type { ChainDeploy } from "../../store/chain.ts";
import { MOST, type TickerItem } from "./ticker.ts";

/** The chain's deploys a universe's page shows (slice 9g), and the path its realms' pages live under ("" for the default universe). */
export interface Deploys {
  deploys: readonly ChainDeploy[];
  universe: string;
  prefix: string;
}

// A realm's path for the line: what the chain wrote, as text, its creator's address cut to its ends as the room's cards cut it, capped.
const named = (realm: string): string =>
  stripped(realm)
    .slice("gno.land/".length)
    .replace(/g1[0-9a-z]{38}/g, short)
    .slice(0, 80);

/** The strip with the chain's newest deploys first, from this universe's chain alone (another's is no line of this page's strip), still six at most. */
export function withChain(items: readonly TickerItem[], { deploys, universe, prefix }: Deploys): TickerItem[] {
  const deployed = deploys
    .filter((deploy) => deploy.universe === universe)
    .toSorted((a, b) => b.height - a.height)
    .map((deploy): TickerItem => ({
      id: `chain-${String(deploy.height)}-${deploy.realm}`,
      kind: "chain",
      text: `${named(deploy.realm)} deployed · block ${String(deploy.height)}`,
      link: `${prefix}${deploy.realm.slice("gno.land".length)}`,
    }));
  return [...deployed, ...items].slice(0, MOST);
}
