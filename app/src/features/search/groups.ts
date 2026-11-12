// The results of an empty field, in groups.
import { SHOWN } from "./search.ts";
import type { SearchKind, SearchResult, SearchSort } from "./types.ts";

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

/** The results of an empty field in groups: the recent places first, then every kind in turn, the busiest first; each place once (in the order a sort asks), a
 * group's first few, and how many more there were. */
export function groupResults(
  found: readonly SearchResult[],
  recent: readonly string[],
  sort: SearchSort = "relevance",
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
      results: rest.filter(({ item }) => item.kind === kind).sort(sort === "relevance" ? busiest : () => 0),
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
