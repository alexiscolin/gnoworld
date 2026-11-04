// Where a world leads on the page, which the rail's links (7i), the labels' doors and the home's ticker's trends (7t) share: its hub's page,
// else its first realm's view; the Earth to its own. A hub's world is core's hubWorldOf.
import { EARTH, hubWorldOf, REALM_PREFIX } from "@gnoworld/core";

/** The Earth's page, and the hubs the page lists, by their worlds. */
export interface WorldPlaces {
  readonly earth: string;
  readonly worlds: readonly {
    readonly slug: string;
    readonly path: string;
    readonly realms?: readonly string[] | undefined;
  }[];
}

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
