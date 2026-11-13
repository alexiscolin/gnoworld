// Realms for the store's tests: a handful with every trait a rule reads, and a generator for the speed's fixture.
import type { StoreRealm } from "./rows.ts";

export const realm = (path: string, own: Partial<StoreRealm> = {}): StoreRealm => ({
  path,
  namespace: path.split("/")[2] ?? "",
  author: null,
  functions: ["Render"],
  imports: [],
  calls: 0,
  callers: 0,
  lastHeight: null,
  firstHeight: null,
  rise: null,
  world: "w",
  ...own,
});

/** `count` realms, spread over every trait, from a counter alone (no chance). */
export const crowd = (count: number): StoreRealm[] =>
  Array.from({ length: count }, (_, i) =>
    realm(`gno.land/r/ns${String(i % 97)}/${["game", "pool", "board", "zzz", "counter"][i % 5] ?? "zzz"}${String(i)}`, {
      calls: i % 211,
      callers: i % 13,
      lastHeight: i % 3 === 0 ? null : 1_000_000 - ((i * 7919) % 400_000),
      author: i % 4 === 0 ? "alice" : null,
      functions: i % 6 === 0 ? [] : ["Render"],
    }),
  );
