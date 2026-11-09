// The palette's search: one pass over the index of the places the page already holds, so typing sends no request. A query is a name, or
// opens with a mark: `#` a room, `@` a namespace, `/r/` a realm's path, `>` a command (D355). The best 50 come back, with how many answered.
import { realmPage } from "../../lib/realmPage.ts";
import { matchLower, parseQuery, wordsOf } from "./match.ts";
import type { Entry, SearchIndex } from "./searchIndex.ts";
import {
  COMMANDS,
  type Found,
  type SearchFilter,
  type SearchItem,
  type SearchKind,
  type SearchOptions,
  type SearchResult,
  type SearchSort,
} from "./types.ts";

const KIND_FILTERS: Readonly<Record<string, (item: SearchItem) => boolean>> = {
  worlds: (item) => item.kind === "world" && item.tag !== "DAO",
  dao: (item) => item.tag === "DAO",
  stations: (item) => item.kind === "station",
  systems: (item) => item.kind === "system",
};
const NARROWS: Readonly<Record<string, (item: SearchItem) => boolean>> = {
  here: (item) => (item.here ?? 0) > 0,
  active: (item) => item.active === true,
  new: (item) => item.fresh === true,
  unseen: (item) => (item.kind === "world" || item.kind === "station") && item.visited === false,
};

// The test of the chips and the namespace, made once for a search: kinds add to each other, the rest narrow.
function keeping(filters: ReadonlySet<SearchFilter>, namespace: string | undefined): (item: SearchItem) => boolean {
  const kinds = [...filters].flatMap((each) => KIND_FILTERS[each] ?? []);
  const narrows = [...filters].flatMap((each) => NARROWS[each] ?? []);
  return (item) =>
    (kinds.length === 0 || kinds.some((test) => test(item))) &&
    narrows.every((test) => test(item)) &&
    (namespace === undefined || item.namespace === namespace);
}

/** The most results a list draws: past it, the words are to be refined. */
export const SHOWN = 50;
const FUZZY_CAP = 500;

interface Scored {
  score: number;
  result: SearchResult;
}

// What narrows a search: the chips' test, and a note to give each result.
interface Ask {
  keep: (item: SearchItem) => boolean;
  sort: SearchSort;
  note?: (entry: Entry) => string;
}

// The entries that pass the ask and answer `text`: the plain matches, and only when few, those a few letters off.
function rank(entries: readonly Entry[], text: string, { keep, note }: Pick<Ask, "keep" | "note">): Scored[] {
  const found: Scored[] = [];
  const missed: Entry[] = [];
  for (const entry of entries) {
    if (!keep(entry.item)) continue;
    const m = matchLower(entry, text, false);
    if (m === undefined) missed.push(entry);
    else
      found.push({
        score: m.score,
        result: { item: entry.item, hits: m.hits, ...(note === undefined ? {} : { note: note(entry) }) },
      });
  }
  if (found.length < SHOWN / 5 && text.length >= 4) {
    // ponytail: past this many names a few letters off the pass stops: the best 50 come from the first ones, and the count says "more".
    for (const entry of missed) {
      if (found.length >= FUZZY_CAP) break;
      const m = matchLower(entry, text, true);
      if (m !== undefined) found.push({ score: m.score, result: { item: entry.item, hits: [] } });
    }
  }
  return found;
}

const KEYS: Readonly<Record<string, (item: SearchItem) => number>> = {
  here: (item) => item.here ?? 0,
  activity: (item) => item.calls ?? 0,
  newest: (item) => item.seen ?? 0,
};

// The order a sort asks, or none: the first thing that tells two results apart.
const bySort = (sort: SearchSort, a: SearchItem, b: SearchItem): number => {
  if (sort === "name") return a.name.localeCompare(b.name);
  const key = KEYS[sort];
  return key === undefined ? 0 : key(b) - key(a);
};

const orderOf = (sort: SearchSort) => (a: Scored, b: Scored) => {
  const [x, y] = [a.result.item, b.result.item];
  return (
    bySort(sort, x, y) ||
    b.score - a.score ||
    (y.here ?? 0) - (x.here ?? 0) ||
    (y.calls ?? 0) - (x.calls ?? 0) ||
    (a.score > 0 ? x.name.length - y.name.length : 0)
  );
};

// The best few, in the order asked, and how many there were.
function best(found: Scored[], sort: SearchSort, shown = SHOWN): Found {
  if (shown <= 0) return { results: [], total: found.length };
  const results = found.sort(orderOf(sort)).map(({ result }) => result);
  return { results: results.slice(0, shown), total: results.length };
}

const all = (entries: readonly Entry[], keep: (item: SearchItem) => boolean): Scored[] =>
  entries.filter((entry) => keep(entry.item)).map((entry) => ({ score: 0, result: { item: entry.item, hits: [] } }));

// A system by its namespace; a namespace named whole also lists its realms.
function inNamespaces(index: SearchIndex, text: string, { keep, sort }: Ask): Found {
  const systems = rank(index.systems, text, { keep });
  const whole = index.systems.find(({ lower }) => lower === text);
  const realms =
    whole === undefined ? [] : all(index.realms, (item) => item.namespace === whole.item.name && keep(item));
  const found = best(systems, sort);
  const more = best(realms, sort, SHOWN - found.results.length);
  return { results: [...found.results, ...more.results], total: found.total + more.total };
}

// A realm by its path; one typed whole is offered, listed or not, when no listed realm answers.
function inRealms(index: SearchIndex, text: string, ask: Ask): Found {
  const found = best(rank(index.realms, text, ask), ask.sort);
  const page = found.total > 0 ? undefined : realmPage(`gno.land/r/${text}`);
  if (page === undefined) return found;
  const item: SearchItem = { name: text, kind: "realm", universe: "", path: page, description: "A realm, by its path" };
  return { results: [{ item, hits: [] }], total: 1 };
}

// A plain word: the places, then the systems, then the realms, the best 50 of them all and how many answered.
function inEverything(index: SearchIndex, text: string, ask: Ask): Found {
  const results: SearchResult[] = [];
  let total = 0;
  for (const entries of [index.places, index.systems, index.realms]) {
    const found = best(rank(entries, text, ask), ask.sort, SHOWN - results.length);
    results.push(...found.results);
    total += found.total;
  }
  return { results, total };
}

const COMMAND_ENTRIES = COMMANDS.map((item) => ({ item, lower: item.name, words: wordsOf(item.name) }));

/** The best results of `query` over the `index`: a name matches places, systems and stations; `#` their rooms; `@` the systems, and a
 * namespace named whole also lists its realms; `/r/` the realms; `>` the commands. The chips and the namespace narrow all but commands.
 * An empty name lists every place, for the groups of the empty field to cut. */
export function searchPlaces(index: SearchIndex, query: string, options?: Partial<SearchOptions>): Found {
  const { filters = new Set<SearchFilter>(), sort = "relevance", namespace } = options ?? {};
  const { mode, text } = parseQuery(query);
  if (mode === "command") return best(rank(COMMAND_ENTRIES, text, { keep: () => true }), "relevance");
  const ask: Ask = { keep: keeping(filters, namespace), sort };
  if (mode === "room")
    return best(rank(index.rooms, text, { ...ask, note: ({ room }) => `${room ?? ""} · room` }), sort);
  if (mode === "namespace") return inNamespaces(index, text, ask);
  if (mode === "realm") return inRealms(index, text, ask);
  if (text === "") {
    const places = all([...index.places, ...index.systems], ask.keep);
    return {
      results: (sort === "relevance" ? places : places.sort(orderOf(sort))).map(({ result }) => result),
      total: places.length,
    };
  }
  return inEverything(index, text, ask);
}

const ORDER: readonly { kind: SearchKind; label: string }[] = [
  { kind: "world", label: "Worlds" },
  { kind: "station", label: "Stations" },
  { kind: "ecosystem", label: "Ecosystems" },
  { kind: "earth", label: "Home" },
  { kind: "cosmos", label: "Universes" },
  { kind: "system", label: "Systems" },
  { kind: "realm", label: "Realms" },
  { kind: "command", label: "Commands" },
];

/** The results of an empty field in groups: the recent places first, then every kind in turn, the busiest first; each place once, a
 * group's first few, and how many more there were. */
export function groupResults(
  found: readonly SearchResult[],
  recent: readonly string[],
): { groups: { id: string; label: string; results: SearchResult[] }[]; more: number } {
  const byPath = new Map(found.map((each) => [each.item.path, each]));
  const latest = recent.flatMap((path) => byPath.get(path) ?? []);
  const taken = new Set(latest.map(({ item }) => item.path));
  const rest = found.filter(({ item }) => !taken.has(item.path));
  const busiest = (a: SearchResult, b: SearchResult) =>
    (b.item.here ?? 0) - (a.item.here ?? 0) || (b.item.calls ?? 0) - (a.item.calls ?? 0);
  const groups = [
    { id: "recent", label: "Recent", results: latest },
    ...ORDER.map(({ kind, label }) => ({
      id: kind,
      label,
      results: rest.filter(({ item }) => item.kind === kind).sort(busiest),
    })),
  ].filter((group) => group.results.length > 0);
  const shown = groups.map((group) => ({ ...group, results: group.results.slice(0, SHOWN) }));
  return {
    groups: shown,
    more:
      groups.reduce((sum, group) => sum + group.results.length, 0) -
      shown.reduce((sum, group) => sum + group.results.length, 0),
  };
}
