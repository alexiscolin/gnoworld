// The palette's tabs: a search's places, rooms and people cut by the tab asked, and the typed results in groups by kind.
import { parseQuery } from "./match.ts";
import type { Found, SearchResult, SearchTab } from "./types.ts";

type Part = Exclude<SearchTab, "all">;
export const NONE: Found = { results: [], total: 0 };
// In the tab of all, the rooms and the people show this many first; their own tab shows the best 50.
const EACH = 10;

/** The three parts of a search, cut by the tab: all of them in turn, or one; the counts are always the whole. A world's main room is
 * its place's row: where `mainRooms` is false it is left out of the rows in all, and of the count of those that are more. */
export function tabbed(parts: Record<Part, Found>, tab: SearchTab, mainRooms: boolean): Found {
  const counts = { places: parts.places.total, rooms: parts.rooms.total, people: parts.people.total };
  if (tab !== "all") return { ...parts[tab], counts };
  const beside = parts.rooms.results.filter(({ item }) => mainRooms || item.kind === "room");
  const mains = parts.rooms.results.length - beside.length;
  return {
    results: [...parts.places.results, ...beside.slice(0, EACH), ...parts.people.results.slice(0, EACH)],
    total: counts.places + counts.rooms - mains + counts.people,
    counts,
  };
}

const GROUPS: readonly { id: Part; label: string }[] = [
  { id: "places", label: "Places" },
  { id: "rooms", label: "Rooms" },
  { id: "people", label: "People" },
];

const partOf = ({ item, room }: SearchResult): Part =>
  item.kind === "person" ? "people" : item.kind === "room" || room === true ? "rooms" : "places";

/** The typed results in groups by kind, each labelled and the places first; one group with no label where the words have no kind (a
 * command, a realm) or the results hold one kind alone, which the tab or the words say already. */
export function typedGroups(
  results: readonly SearchResult[],
  byKind: boolean,
): { id: string; label: string; results: SearchResult[] }[] {
  const cut = GROUPS.map(({ id, label }) => ({ id, label, results: results.filter((each) => partOf(each) === id) }));
  const some = cut.filter((group) => group.results.length > 0);
  return byKind && some.length > 1 ? some : [{ id: "found", label: "", results: [...results] }];
}

/** Whether the words are cut into kinds: a command's or a realm's are not. */
export const kinded = (query: string): boolean => !["command", "realm"].includes(parseQuery(query).mode);
