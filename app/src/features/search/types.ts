// What the palette's search holds and answers: the items, the chips, the commands and the results.
import type { PlaceKind } from "@gnoworld/core";

/** A kind of result: a place of the site, a station (a world of its own round the Earth), a namespace's system, a realm or a command. */
export type SearchKind = PlaceKind | "station" | "system" | "realm" | "command";
export interface SearchItem {
  name: string;
  kind: SearchKind;
  universe: string;
  path: string;
  /** What a world is when it is no plain hub: "DAO", "dApp". */
  tag?: string;
  description?: string;
  /** A world's or a station's name in its roles file, which the server's presence counts by; the Earth's is "earth". */
  slug?: string;
  /** The world a hub groups into (core's hubWorldOf): its picture and its visits are by it. */
  world?: string;
  /** The namespace of a system, or of a realm. */
  namespace?: string;
  /** The rooms of a place, which `#` finds. */
  rooms?: readonly string[];
  /** A command's name, which the page runs. */
  command?: "plan" | "explore";
  /** The people in it now, whether it is a new world, whether this device has been: what the chips ask. */
  here?: number;
  fresh?: boolean;
  visited?: boolean;
  /** What the worlds' file says of it: the calls its realms received, when it was last seen, and whether that was in the last day. */
  calls?: number;
  seen?: number;
  active?: boolean;
}

/** A chip: kinds of place add to each other, the others narrow. */
export type SearchFilter = "worlds" | "dao" | "stations" | "systems" | "here" | "active" | "new" | "unseen";
export const FILTERS: readonly { id: SearchFilter; label: string }[] = [
  { id: "worlds", label: "Worlds" },
  { id: "dao", label: "DAO" },
  { id: "stations", label: "Stations" },
  { id: "systems", label: "Systems" },
  { id: "here", label: "People here" },
  { id: "active", label: "Active in 24 h" },
  { id: "new", label: "New" },
  { id: "unseen", label: "Not visited" },
];

/** A result: the item, the letters of its name the query matched (to mark), and what a prefix says of it. */
export interface SearchResult {
  item: SearchItem;
  hits: readonly number[];
  note?: string;
}

const command = (name: string, description: string, run?: "plan" | "explore"): SearchItem => ({
  name,
  kind: "command",
  universe: "",
  path: "",
  description,
  ...(run === undefined ? {} : { command: run }),
});

/** The commands `>` lists. */
export const COMMANDS: readonly SearchItem[] = [
  command("earth", "Go to the Earth, where everyone talks"),
  command("universe", "Go to the whole universe, far out"),
  command("plan", "Look at the universe from above, the map", "plan"),
  command("explore", "Go to a live place, or the next stop", "explore"),
];

/** How the results are ordered: by how well they answer, or by one of what the worlds' file and the server say. */
export type SearchSort = "relevance" | "here" | "activity" | "newest" | "name";
export const SORTS: readonly { value: SearchSort; label: string }[] = [
  { value: "relevance", label: "Best match" },
  { value: "here", label: "People here" },
  { value: "activity", label: "Most active" },
  { value: "newest", label: "Newest" },
  { value: "name", label: "A to Z" },
];

/** What narrows and orders a search besides its words. */
export interface SearchOptions {
  filters: ReadonlySet<SearchFilter>;
  sort: SearchSort;
  /** Only the places of this namespace. */
  namespace?: string | undefined;
}

/** The best results, and how many answered in all: a list never draws thousands. */
export interface Found {
  results: SearchResult[];
  total: number;
}
