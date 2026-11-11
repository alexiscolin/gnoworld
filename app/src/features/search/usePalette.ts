// What the palette holds while it is open: the words, the chips, the sort and the namespace, the results they give and the one chosen.
// Each opening starts from its words: a closing cleared them, and the same ask again must find them.
import { useState } from "react";
import { recentPaths } from "../../lib/recents.ts";
import type { UniverseView } from "../../places.ts";
import { groupResults, searchPlaces } from "./search.ts";
import { kinded, typedGroups } from "./tabs.ts";
import type { SearchFilter, SearchSort, SearchTab } from "./types.ts";
import { useSearchItems } from "./useSearchItems.ts";

export function usePalette(universe: UniverseView, open: boolean, start: string) {
  const opening = start === "" ? "" : `@${start}`;
  const [query, setQuery] = useState(opening);
  const [filters, setFilters] = useState<ReadonlySet<SearchFilter>>(() => new Set());
  const [sort, setSort] = useState<SearchSort>("relevance");
  const [namespace, setNamespace] = useState<string>();
  const [tab, setTab] = useState<SearchTab>("all");
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(open);
  if (open !== shown) {
    setShown(open);
    if (open) {
      setQuery(opening);
      setAt(0);
    }
  }
  const { index, worlds, here } = useSearchItems(universe, open);
  const found = searchPlaces(index, query, { filters, sort, namespace, tab });
  const listing = query.trim() === "";
  const grouped = listing ? groupResults(found.results, recentPaths()) : undefined;
  const groups = grouped?.groups ?? typedGroups(found.results, kinded(query));
  const flat = groups.flatMap((group) => group.results);
  const active = Math.min(at, Math.max(0, flat.length - 1));
  return {
    worlds,
    here,
    query,
    filters,
    sort,
    namespace,
    tab,
    counts: found.counts,
    namespaces: index.namespaces.slice(0, 6),
    groups,
    flat,
    active,
    chosen: flat[active]?.item,
    more: grouped?.more ?? found.total - found.results.length,
    ask: (words: string) => {
      setQuery(words);
      setAt(0);
    },
    choose: setAt,
    order: (next: SearchSort) => {
      setSort(next);
      setAt(0);
    },
    toggle: (id: SearchFilter) => {
      setFilters((now) => {
        const next = new Set(now);
        if (!next.delete(id)) next.add(id);
        return next;
      });
      setAt(0);
    },
    pick: (next: SearchTab) => {
      setTab(next);
      setAt(0);
    },
    only: (name: string) => {
      setNamespace((now) => (now === name ? undefined : name));
      setAt(0);
    },
    reset: () => {
      setQuery("");
      setFilters(new Set());
      setSort("relevance");
      setNamespace(undefined);
      setTab("all");
      setAt(0);
    },
  };
}
