// The palette's search: one pass over the places the page already holds, so typing sends no request.
import type { PlaceKind } from "@gnoworld/core";
import type { siteOf } from "../../places.ts";

export interface SearchItem {
  name: string;
  kind: PlaceKind;
  universe: string;
  path: string;
}
export interface SearchGroup {
  kind: PlaceKind;
  count: number;
  items: SearchItem[];
}

/** The groups' order in the palette: the broadest place first. */
const ORDER: PlaceKind[] = ["cosmos", "earth", "world", "ecosystem"];

/** The places whose name holds the query, whatever the case, in groups by kind; the names that start with it come first
 * in a group. A query is text, never a pattern; the empty one finds every place. */
export function searchPlaces(items: SearchItem[], query: string): SearchGroup[] {
  const wanted = query.trim().toLowerCase();
  const starts: SearchItem[][] = ORDER.map(() => []);
  const holds: SearchItem[][] = ORDER.map(() => []);
  for (const item of items) {
    const at = item.name.toLowerCase().indexOf(wanted);
    const group = ORDER.indexOf(item.kind);
    if (at === 0) starts[group]?.push(item);
    else if (at > 0) holds[group]?.push(item);
  }
  return ORDER.flatMap((kind, n) => {
    const found = [...(starts[n] ?? []), ...(holds[n] ?? [])];
    return found.length === 0 ? [] : [{ kind, count: found.length, items: found }];
  });
}

/** One item for each place of the site: a world or an ecosystem by its name, a universe's cosmos by the universe's name
 * and its Earth by that name too, so none is mistaken for another universe's. */
export function searchItemsOf(site: ReturnType<typeof siteOf>): SearchItem[] {
  const names = new Map(site.universes.map((universe) => [universe.id, universe.name]));
  const listed = new Map([...site.worlds, ...site.ecosystems].map((each) => [each.path, each.name]));
  const items = site.places.map(({ kind, universe, path }) => {
    const home = names.get(universe) ?? universe;
    const name = kind === "cosmos" ? home : kind === "earth" ? `Earth of ${home}` : (listed.get(path) ?? path);
    return { name, kind, universe, path };
  });
  // The schema lets two universes hold the same name: the option then says which universe it leads to.
  const seen = new Map<string, number>();
  for (const { name, kind } of items) seen.set(`${kind}/${name}`, (seen.get(`${kind}/${name}`) ?? 0) + 1);
  return items.map((item) =>
    (seen.get(`${item.kind}/${item.name}`) ?? 0) > 1
      ? { ...item, name: `${item.name} (${names.get(item.universe) ?? item.universe})` }
      : item,
  );
}

/** ⌘K on a Mac, Ctrl+K elsewhere, with no other modifier: a bare k, or Shift or Alt with it, is for the page. */
export function opensPalette(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): boolean {
  return event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}
