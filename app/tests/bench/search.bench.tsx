// ⌘K's budget (docs/plans/slice-5.md §4): a keystroke, under 16 ms
// at 1k, 10k and 100k places, whatever the data files hold today. Measured by scripts/bench.py, run by hand.
import { bench, describe } from "vitest";
import { groupResults } from "../../src/features/search/groups.ts";
import { searchPlaces } from "../../src/features/search/search.ts";
import { buildIndex, type SearchIndex } from "../../src/features/search/searchIndex.ts";

const KINDS = ["world", "ecosystem", "world", "world"] as const;
const universe = (count: number): SearchIndex =>
  buildIndex([
    { name: "Onyx", kind: "cosmos", universe: "onyx", path: "/" },
    { name: "Earth of Onyx", kind: "earth", universe: "onyx", path: "/earth" },
    ...Array.from({ length: count }, (_, n) => ({
      name: `Realm number ${String(n)}`,
      kind: KINDS[n % KINDS.length] ?? "world",
      universe: "onyx",
      path: `/w/realm-${String(n)}`,
    })),
  ]);

/** The keystroke: the search, then the groups the dialog draws; how many results it found. */
function keystroke(index: SearchIndex, query: string) {
  const found = searchPlaces(index, query);
  groupResults(found.results, []);
  return found.results.length;
}

/** One keystroke timed; a query that should find and finds nothing, or the reverse, throws: the bench then has no sample. */
const timed = (items: SearchIndex, query: string, finds: boolean) => () => {
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
  bench("a keystroke, a query a few letters off, over 10000 places [16 ms]", timed(tenThousand, "raelm", true));
  bench("a keystroke, the empty query, over 100000 places [16 ms]", timed(hundredThousand, "", true));
  bench("a keystroke, a query that matches, over 100000 places [16 ms]", timed(hundredThousand, "number 1", true));
  bench("a keystroke, a query that matches nothing, over 100000 places [16 ms]", timed(hundredThousand, "zzz", false));
});
