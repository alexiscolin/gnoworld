import { describe, expect, it } from "vitest";
import { BATCH_MIN, compareLists } from "./compare.ts";

// New families and batches are found by comparing the list read now with the one read last time: the chain gives no deploy
// date through the paths (7c-notes.md), and one transaction can deploy many packages (chain-feasibility.md, item 11).
const r = (rest: string): string => `gno.land/r/${rest}`;
const many = (namespace: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => r(`${namespace}/app${String(i)}/v0`));

describe("compareLists", () => {
  it("finds nothing when the list did not change", () => {
    const list = [r("samcrew/memba_gov"), r("gnoswap/pool")];
    expect(compareLists(list, list)).toEqual({ added: [], newWorlds: [], batches: [] });
  });

  it("gives a new version of a known world as an added realm and no new world", () => {
    const result = compareLists([r("gnoswap/pool")], [r("gnoswap/pool"), r("gnoswap/pool/v1")]);
    expect(result.added).toEqual([r("gnoswap/pool/v1")]);
    expect(result.newWorlds).toEqual([]);
  });

  it("gives a world that had no realm before as new, once, with its added realms", () => {
    const result = compareLists([r("gnoswap/pool")], [r("gnoswap/pool"), r("newcomer/dex"), r("newcomer/dex/v1")]);
    expect(result.newWorlds).toEqual(["newcomer/dex"]);
    expect(result.added).toEqual([r("newcomer/dex"), r("newcomer/dex/v1")]);
  });

  it("does not call a realm that left the list new, or news (a world that comes back is the job's to keep apart)", () => {
    const result = compareLists([r("a/x"), r("a/y")], [r("a/x")]);
    expect(result).toEqual({ added: [], newWorlds: [], batches: [] });
  });

  it("takes a first list for no news: nothing is new when nothing was known", () => {
    const result = compareLists([], many("nym-moultest123", 40));
    expect(result.newWorlds).toEqual([]);
    expect(result.batches).toEqual([]);
    expect(result.added).toHaveLength(40);
  });

  it(`finds a batch when one namespace gains ${String(BATCH_MIN)} realms or more at once, and not before`, () => {
    const before = [r("keep/one")];
    expect(compareLists(before, [...before, ...many("mass", BATCH_MIN)]).batches).toEqual([
      { namespace: "mass", realms: many("mass", BATCH_MIN).sort() },
    ]);
    expect(compareLists(before, [...before, ...many("mass", BATCH_MIN - 1)]).batches).toEqual([]);
  });

  it("keeps two namespaces' batches apart and lists them by namespace", () => {
    const result = compareLists([r("keep/one")], [r("keep/one"), ...many("zz", 6), ...many("aa", 7)]);
    expect(result.batches.map((batch) => batch.namespace)).toEqual(["aa", "zz"]);
    expect(result.newWorlds).toHaveLength(13);
  });

  it("is the same whatever the order of either list, or a path given twice", () => {
    const before = [r("a/x"), r("b/y")];
    const after = [r("a/x"), r("b/y"), ...many("c", 6)];
    expect(compareLists([...before].reverse().concat(before), [...after].reverse())).toEqual(
      compareLists(before, after),
    );
  });

  it("drops a hostile path from every part of its answer", () => {
    const result = compareLists([r("a/x")], [r("a/x"), r("a/<b>"), "gno.land/p/x/y", r("b/ok")]);
    expect(result.added).toEqual([r("b/ok")]);
    expect(result.newWorlds).toEqual(["b/ok"]);
  });
});
