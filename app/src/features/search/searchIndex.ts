// The index of what the palette searches, built once per set of items (the worlds' file, the people here), never per keystroke: each
// name lowered and cut into words once, the rooms and the namespaces gathered, so a keystroke is one pass of string tests.
import { isAddress } from "@gnoworld/core";
import { wordsOf } from "./match.ts";
import type { SearchItem } from "./types.ts";

export interface Entry {
  item: SearchItem;
  /** The text a query is matched against, lowercase. */
  lower: string;
  words: readonly string[];
  /** A room's own name, with its `#`, in an entry of the rooms. */
  room?: string;
}
export interface SearchIndex {
  places: readonly Entry[];
  systems: readonly Entry[];
  realms: readonly Entry[];
  /** Each room of a place, as an entry of the room's name without its `#`. */
  rooms: readonly Entry[];
  /** The namespaces by the calls their realms got, the busiest first. */
  namespaces: readonly string[];
}

const entryOf = (item: SearchItem, text = item.name): Entry => {
  const lower = text.toLowerCase();
  return { item, lower, words: wordsOf(lower) };
};

export function buildIndex(items: readonly SearchItem[]): SearchIndex {
  const calls = new Map<string, number>();
  // A namespace that is an account's address is no name to offer as a chip; `@` still finds it.
  for (const { kind, namespace, calls: got } of items)
    if (kind === "system" && namespace !== undefined && !isAddress(namespace)) calls.set(namespace, got ?? 0);
  return {
    places: items.filter((item) => item.kind !== "realm" && item.kind !== "system").map((item) => entryOf(item)),
    systems: items.filter((item) => item.kind === "system").map((item) => entryOf(item)),
    realms: items.filter((item) => item.kind === "realm").map((item) => entryOf(item)),
    rooms: items.flatMap((item) => (item.rooms ?? []).map((room) => ({ ...entryOf(item, room.slice(1)), room }))),
    namespaces: [...calls].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name),
  };
}
