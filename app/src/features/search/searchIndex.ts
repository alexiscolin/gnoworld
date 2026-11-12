// The index of what the palette searches, built once per set of items (the worlds' file, the people here), never per keystroke: each
// name lowered and cut into words once, the rooms and the namespaces gathered, so a keystroke is one pass of string tests.
import { isAddress } from "@gnoworld/core";
import { matchLower, wordsOf } from "./match.ts";
import type { SearchItem } from "./types.ts";

export interface Entry {
  item: SearchItem;
  /** The text a query is matched against, lowercase. */
  lower: string;
  words: readonly string[];
  /** A room's own name, with its `#`, in an entry of the rooms. */
  room?: string;
  /** A realm's exported functions, each with its name's words, cut once. */
  fns?: readonly Fn[];
}
interface Fn {
  name: string;
  /** The name's words, lowercase and apart by a space: `MustVoteOnProposal` is "must vote on proposal". */
  lower: string;
  words: readonly string[];
}
export interface SearchIndex {
  places: readonly Entry[];
  systems: readonly Entry[];
  realms: readonly Entry[];
  /** Each room of a place, as an entry of the room's name without its `#`, then the rooms the chat lists. */
  rooms: readonly Entry[];
  /** The people the chat knows. */
  people: readonly Entry[];
  /** The namespaces by the calls their realms got, the busiest first. */
  namespaces: readonly string[];
}

const NOT_PLACES: ReadonlySet<SearchItem["kind"]> = new Set(["realm", "system", "room", "person"]);

const entryOf = (item: SearchItem, text = item.name): Entry => {
  const lower = text.toLowerCase();
  return { item, lower, words: wordsOf(lower) };
};

const fnOf = (name: string): Fn => {
  const lower = name
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase();
  return { name, lower, words: wordsOf(lower) };
};

const realmEntry = (item: SearchItem): Entry =>
  item.functions === undefined || item.functions.length === 0
    ? entryOf(item)
    : { ...entryOf(item), fns: item.functions.map(fnOf) };

export function buildIndex(items: readonly SearchItem[]): SearchIndex {
  const calls = new Map<string, number>();
  // A namespace that is an account's address is no name to offer as a chip; `@` still finds it.
  for (const { kind, namespace, calls: got } of items)
    if (kind === "system" && namespace !== undefined && !isAddress(namespace)) calls.set(namespace, got ?? 0);
  const mains = items.flatMap((item) => (item.rooms ?? []).map((room) => ({ ...entryOf(item, room.slice(1)), room })));
  const taken = new Set(mains.map(({ room }) => room));
  const listed = items
    .filter((item) => item.kind === "room" && !taken.has(`#${item.name}`))
    .map((item) => ({ ...entryOf(item), room: `#${item.name}` }))
    .filter(({ room }, at, all) => all.findIndex((other) => other.room === room) === at);
  return {
    places: items.filter((item) => !NOT_PLACES.has(item.kind)).map((item) => entryOf(item)),
    systems: items.filter((item) => item.kind === "system").map((item) => entryOf(item)),
    realms: items.filter((item) => item.kind === "realm").map(realmEntry),
    rooms: [...mains, ...listed],
    people: items.filter((item) => item.kind === "person").map((item) => entryOf(item)),
    namespaces: [...calls].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name),
  };
}

/** What a function's words score: under every plain name match (700 and up), over the scattered letters of a name (400), which on a long
 * address answer almost any word. */
export const FUNCTION_SCORE = 500;
const NOTED = 3;

/** How an entry's functions answer `text`, or none: a part of their words, or, when `fuzzy`, a few letters off (a name's scale, less 200),
 * and the first three that did, as its note. Under three letters nothing but a whole part answers. */
export function byFunctions({ fns }: Entry, text: string, fuzzy: boolean): { score: number; note: string } | undefined {
  if (text.length < 3) return undefined;
  const hits = (fns ?? []).filter((fn) =>
    fuzzy ? matchLower(fn, text, true) !== undefined : fn.lower.includes(text) || fn.name.toLowerCase().includes(text),
  );
  if (hits.length === 0) return undefined;
  return {
    score: fuzzy ? FUNCTION_SCORE - 200 : FUNCTION_SCORE,
    note: hits
      .slice(0, NOTED)
      .map(({ name }) => name)
      .join(", "),
  };
}
