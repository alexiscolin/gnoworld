// A hub's world (decision of 2026-11-01, 11): the world its first realm groups into, as the worlds' job groups it, so its page draws the
// planet the cosmos does; a hub with no realm is a world of its own, by its slug. And where a world leads on the page, which the rail's links
// (7i), the labels' doors and the home's ticker's trends (7t) share: its hub's page, else its first realm's view; the Earth to its own.
import { REALM_PREFIX, worldIdOf } from "@gnoworld/core";

export const hubWorldOf = ({
  slug,
  realms,
}: {
  readonly slug: string;
  readonly realms?: readonly string[] | undefined;
}) => (realms?.[0] === undefined ? slug : worldIdOf(realms[0]));

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

/** A world as its page is found: its id, and its realms, the first the one its view opens. */
interface Paged {
  readonly id: string;
  readonly realms: readonly { readonly path?: string | undefined }[];
}

/** Each world's page: its hub's, else its first realm's view; none for a world with neither. The Earth's is set last: a realm deployed under
 * the namespace earth is a world of that id, and never takes the Earth's link. */
export function pagesOf(worlds: readonly Paged[], { earth, worlds: hubs }: WorldPlaces): Map<string, string> {
  const pages = new Map<string, string>();
  for (const world of worlds) {
    const realm = world.realms[0]?.path;
    if (realm !== undefined) pages.set(world.id, `/r/${realm.slice(REALM_PREFIX.length)}`);
  }
  for (const hub of hubs) pages.set(hubWorldOf(hub), hub.path);
  pages.set(EARTH, earth);
  return pages;
}
