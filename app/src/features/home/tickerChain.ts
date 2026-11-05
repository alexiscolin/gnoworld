// The chain's deploys in the home's strip (slice 9g): the newest of this page's universe first, still six at most, each a link to the realm's own page.
import type { ChainDeploy } from "../../store/chain.ts";
import { MOST, type TickerItem } from "./ticker.ts";

/** The chain's deploys a universe's page shows (slice 9g), and the path its realms' pages live under ("" for the default universe). */
export interface Deploys {
  deploys: readonly ChainDeploy[];
  universe: string;
  prefix: string;
}

// A realm's path for the line: what the chain wrote, capped.
const named = (realm: string): string => realm.slice("gno.land/".length, "gno.land/".length + 80);

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
