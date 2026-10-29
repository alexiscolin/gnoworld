// ⌘K's budget (docs/plans/slice-5.md §4): a keystroke, the search over every place and the list's markup, under 16 ms
// at 1k, 10k and 100k places, whatever the data files hold today. Measured by scripts/bench.py in the full gate.
import { Combobox } from "@gnoworld/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { bench, describe } from "vitest";
import { searchPlaces, type SearchGroup, type SearchItem } from "../../src/features/search/search.ts";

const KINDS = ["world", "ecosystem", "world", "world"] as const;
const universe = (count: number): SearchItem[] => [
  { name: "Onyx", kind: "cosmos", universe: "onyx", path: "/" },
  { name: "Earth of Onyx", kind: "earth", universe: "onyx", path: "/earth" },
  ...Array.from({ length: count }, (_, n) => ({
    name: `Realm number ${String(n)}`,
    kind: KINDS[n % KINDS.length] ?? "world",
    universe: "onyx",
    path: `/w/realm-${String(n)}`,
  })),
];

const groupsOf = (found: SearchGroup[]) =>
  found.map((group) => ({
    id: group.kind,
    label: group.kind,
    options: group.items.map((item) => ({ id: item.path, label: item.name })),
  }));
/** The keystroke: the search, then the list drawn; how many groups it found. */
function keystroke(items: SearchItem[], query: string) {
  const found = searchPlaces(items, query);
  renderToStaticMarkup(
    <Combobox
      label="Search places"
      value={query}
      onValueChange={() => undefined}
      groups={groupsOf(found)}
      onSelect={() => undefined}
    />,
  );
  return found.length;
}

describe("⌘K", () => {
  for (const count of [1000, 10_000, 100_000]) {
    const items = universe(count);
    // A query that finds nothing would time the cheapest pass, and one that finds all the most grouping: each is timed.
    for (const [what, query, finds] of [
      ["the empty query", "", true],
      ["a query that matches", "number 1", true],
      ["a query that matches nothing", "zzz", false],
    ] as const)
      bench(`a keystroke, ${what}, over ${String(count)} places [16 ms]`, () => {
        if (keystroke(items, query) > 0 !== finds)
          throw new Error(`the bench's query ${JSON.stringify(query)} should ${finds ? "" : "not "}find`);
      });
  }
});
