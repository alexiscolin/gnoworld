// The search drawer's search: one pass over the places the page already holds, so typing sends no request.
import { labelName, type PlaceKind } from "@gnoworld/core";
import type { siteOf } from "../../places.ts";
import { realmPage } from "../../scene/cosmos/planWords.ts";

/** A group of the drawer: a kind of place, or the stations, worlds of a kind of their own round the Earth (8l). */
export type SearchKind = PlaceKind | "station";
export interface SearchItem {
  name: string;
  kind: SearchKind;
  universe: string;
  path: string;
  /** What a world is when it is no plain hub, as frame 98's "DAO · 96" says it. */
  tag?: string;
}
export interface SearchGroup {
  kind: SearchKind;
  count: number;
  items: SearchItem[];
}

/** The groups' order in the drawer, as frame 98 lists them: the ecosystems, the hubs, the Earth, the universes, then the stations at its
 * foot. */
const ORDER: SearchKind[] = ["ecosystem", "world", "earth", "cosmos", "station"];

// A world's kind as its row's tag says it; a hub is the plain kind and says none, a station has its own group.
const TAGS: Readonly<Record<string, string>> = { dao: "DAO", dapp: "dApp" };

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

// A world's item: a station in its own group, a DAO or a dApp with its tag.
function worldItem(item: SearchItem, kind: string | undefined): SearchItem {
  const tag = TAGS[kind ?? ""];
  return { ...item, kind: kind === "station" ? "station" : "world", ...(tag === undefined ? {} : { tag }) };
}

/** One item for each place of the site: a world or an ecosystem by its name, a universe's cosmos by the universe's name
 * and its Earth by that name too, so none is mistaken for another universe's. */
export function searchItemsOf(site: ReturnType<typeof siteOf>): SearchItem[] {
  const names = new Map(site.universes.map((universe) => [universe.id, universe.name]));
  const listed = new Map([...site.worlds, ...site.ecosystems].map((each) => [each.path, each]));
  const items = site.places.map(({ kind, universe, path }): SearchItem => {
    const home = names.get(universe) ?? universe;
    const row = listed.get(path);
    if (kind === "cosmos") return { name: home, kind, universe, path };
    if (kind === "earth") return { name: `Earth of ${home}`, kind, universe, path };
    const name = row?.name ?? path;
    return kind === "world" ? worldItem({ name, kind, universe, path }, row?.kind) : { name, kind, universe, path };
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

// The chord, in a module of its own: the header's button reads it on the first screen, the search itself is the drawer's chunk.
export { opensPalette } from "./chord.ts";

/** A full Plan's namespace's worlds (F5470), from the worlds file the drawer reads already, each to its realm's page, while the words are the
 * namespace's alone; none for other words, no namespace, no file yet or no such world. */
export function namespaceGroup(
  worlds: readonly { id: string; namespace: string; realms: readonly { path?: string | null }[] }[] | undefined,
  namespace: string,
  query: string,
): { id: string; label: string; options: { id: string; label: string }[] }[] {
  if (namespace === "" || query.trim() !== namespace) return [];
  const options = (worlds ?? []).flatMap(({ id, namespace: its, realms }) => {
    const page = its === namespace ? realmPage(realms[0]?.path ?? undefined) : undefined;
    return page === undefined ? [] : [{ id: page, label: labelName(id) ?? id }];
  });
  return options.length === 0
    ? []
    : [{ id: "namespace", label: `Worlds of ${namespace} · ${String(options.length)}`, options }];
}
