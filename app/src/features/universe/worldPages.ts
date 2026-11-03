// Where a world of the cosmos leads on the page: the rail's links (7i) and the labels' doors alike. A world named by its id, as the cosmos
// holds it, goes to its hub's page, else its first realm's view; the Earth to its own.
import { REALM_PREFIX } from "@gnoworld/core";
import { hubWorldOf } from "../../lib/hubWorld.ts";
import type { CosmosWorld } from "../../scene/cosmos/cosmosWorld.ts";

/** The Earth's page, and the hubs the page lists, by their worlds. */
export interface WorldPlaces {
  readonly earth: string;
  readonly worlds: readonly {
    readonly slug: string;
    readonly path: string;
    readonly realms?: readonly string[] | undefined;
  }[];
}

/** The Earth's id, as the cosmos holds it. */
export const EARTH = "earth";

/** Each world's page: its hub's, else its first realm's view; none for a world with neither. The Earth's is set last: a realm deployed under
 * the namespace earth is a world of that id, and never takes the Earth's link. */
export function pagesOf(worlds: readonly CosmosWorld[], { earth, worlds: hubs }: WorldPlaces): Map<string, string> {
  const pages = new Map<string, string>();
  for (const world of worlds) {
    const realm = world.realms[0]?.path;
    if (realm !== undefined) pages.set(world.id, `/r/${realm.slice(REALM_PREFIX.length)}`);
  }
  for (const hub of hubs) pages.set(hubWorldOf(hub), hub.path);
  pages.set(EARTH, earth);
  return pages;
}
