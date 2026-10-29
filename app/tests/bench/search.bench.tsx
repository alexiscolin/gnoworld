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

/** One keystroke timed; a query that should find and finds nothing, or the reverse, throws: the bench then has no sample. */
const timed = (items: SearchItem[], query: string, finds: boolean) => () => {
  if (keystroke(items, query) > 0 !== finds)
    throw new Error(`the bench's query ${JSON.stringify(query)} should ${finds ? "" : "not "}find`);
};

// Each name a literal, so scripts/bench.py sees a bench switched off. A query that finds nothing times the cheapest pass,
// and one that finds all the most grouping: each is timed.
describe("⌘K", () => {
  const thousand = universe(1000);
  const tenThousand = universe(10_000);
  const hundredThousand = universe(100_000);
  bench("a keystroke, the empty query, over 1000 places [16 ms]", timed(thousand, "", true));
  bench("a keystroke, a query that matches, over 1000 places [16 ms]", timed(thousand, "number 1", true));
  bench("a keystroke, a query that matches nothing, over 1000 places [16 ms]", timed(thousand, "zzz", false));
  bench("a keystroke, the empty query, over 10000 places [16 ms]", timed(tenThousand, "", true));
  bench("a keystroke, a query that matches, over 10000 places [16 ms]", timed(tenThousand, "number 1", true));
  bench("a keystroke, a query that matches nothing, over 10000 places [16 ms]", timed(tenThousand, "zzz", false));
  bench("a keystroke, the empty query, over 100000 places [16 ms]", timed(hundredThousand, "", true));
  bench("a keystroke, a query that matches, over 100000 places [16 ms]", timed(hundredThousand, "number 1", true));
  bench("a keystroke, a query that matches nothing, over 100000 places [16 ms]", timed(hundredThousand, "zzz", false));
});
