import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { groupWorlds } from "./group.ts";

// Onyx's 743 realm paths, 2026-11-01 00:11Z (onyxPaths.txt, copied from .claude/tmp/slice-5/recorded/7m-onyx-paths.txt, read
// through gnomcp). The golden numbers come from a replica of the rule run on that list, not from the chain.
const ONYX = readFileSync(new URL("./onyxPaths.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((line) => line !== "");
const r = (rest: string): string => `gno.land/r/${rest}`;
const idsOf = (paths: string[]) => groupWorlds(paths).map((world) => world.id);

describe("groupWorlds, a world is a product (decision of 2026-11-01, 11)", () => {
  it("keeps every realm of the recorded list once, in 91 namespaces and 533 worlds", () => {
    const worlds = groupWorlds(ONYX);
    expect(worlds.flatMap((world) => world.realms).sort()).toEqual([...ONYX].sort());
    expect(new Set(worlds.map((world) => world.namespace)).size).toBe(91);
    expect(worlds).toHaveLength(533);
  });

  it("puts a realm's versions under one world", () => {
    expect(groupWorlds([r("gnoswap/pool"), r("gnoswap/pool/v1"), r("gnoswap/router")])).toEqual([
      { id: "gnoswap/pool", namespace: "gnoswap", realms: [r("gnoswap/pool"), r("gnoswap/pool/v1")] },
      { id: "gnoswap/router", namespace: "gnoswap", realms: [r("gnoswap/router")] },
    ]);
  });

  it("joins what comes before an underscore: memba_feed_v1 and memba_gov are one world", () => {
    const worlds = groupWorlds([r("samcrew/memba_feed_v1"), r("samcrew/memba_gov"), r("samcrew/escrow_v4")]);
    expect(worlds.map((world) => world.id)).toEqual(["samcrew/escrow", "samcrew/memba"]);
    expect(worlds[1]?.realms).toEqual([r("samcrew/memba_feed_v1"), r("samcrew/memba_gov")]);
  });

  it("puts a product's realms in subfolders under its first folder", () => {
    expect(
      idsOf([r("samcrew/launchpad/config/v1"), r("samcrew/launchpad/market/v1"), r("samcrew/launchpad/nft/v1")]),
    ).toEqual(["samcrew/launchpad"]);
  });

  it("keeps a product whose home and versions sit in folders as one world", () => {
    const paths = [r("nym-alexiscolin000/gnoradio/home/v1"), r("nym-alexiscolin000/gnoradio/home/v2")];
    expect(idsOf(paths)).toEqual(["nym-alexiscolin000/gnoradio"]);
  });

  it("keeps the same name in two namespaces as two worlds: nothing is merged across namespaces", () => {
    const worlds = groupWorlds([r("samcrew/escrow_v4"), r("g1a9g8nu3m0xgx58hh36fph49e2xkqm9axlxuf5z/escrow_v4")]);
    expect(worlds).toHaveLength(2);
  });

  it("keeps every generic folder's children apart: x/daily/counter and x/daily/wordle are two worlds, their versions one", () => {
    const paths = [
      r("nym-moultest123/x/daily/counter/v0"),
      r("nym-moultest123/x/daily/counter/v1"),
      r("nym-moultest123/x/daily/wordle/v0"),
    ];
    expect(idsOf(paths)).toEqual(["nym-moultest123/x/daily/counter", "nym-moultest123/x/daily/wordle"]);
    expect(
      idsOf([
        r("g1magld5ptgzaktqcexxq0pgq5lmdf0kz6re8hlv/demo/args/v0"),
        r("g1magld5ptgzaktqcexxq0pgq5lmdf0kz6re8hlv/demo/data/v0"),
      ]),
    ).toHaveLength(2);
  });

  it("gives a realm that is its namespace alone a world of its own", () => {
    const worlds = groupWorlds([r("solo")]);
    expect(worlds).toHaveLength(1);
    expect(worlds[0]).toEqual({ id: "solo", namespace: "solo", realms: [r("solo")] });
  });

  it("gives a namespace's own realm and its products different worlds: solo and solo/app", () => {
    expect(idsOf([r("solo"), r("solo/app")])).toEqual(["solo", "solo/app"]);
  });

  it("does not depend on the order, nor on a path given twice", () => {
    const forward = groupWorlds(ONYX);
    expect(groupWorlds([...ONYX].reverse().concat(ONYX.slice(0, 50)))).toEqual(forward);
  });

  it("sorts worlds by id and realms by path, in code-unit order", () => {
    const worlds = groupWorlds(ONYX);
    const ids = worlds.map((world) => world.id);
    expect(ids).toEqual([...ids].sort());
    for (const world of worlds) expect(world.realms).toEqual([...world.realms].sort());
  });

  it("leaves a world's id inside its namespace, whatever the paths", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...ONYX), { maxLength: 60 }), (paths) => {
        for (const world of groupWorlds(paths)) expect(world.id.startsWith(`${world.namespace}/`)).toBe(true);
      }),
    );
  });
});

describe("groupWorlds, hostile paths", () => {
  const good = r("samcrew/memba_gov");

  it.each([
    ["markup", r("evil/<script>alert(1)</script>")],
    ["a package, not a realm", "gno.land/p/nt/avl/v0"],
    ["another domain", "evil.example/r/samcrew/x"],
    ["upper case", r("Samcrew/X")],
    ["a dot-dot", r("samcrew/../../etc")],
    ["a test path", r("samcrew/foo_test")],
    ["a line break", `${r("samcrew/a")}\n${r("samcrew/b")}`],
    ["a path of a megabyte", r(`samcrew/${"a".repeat(1_000_000)}`)],
    ["a segment of 300 characters", r(`samcrew/${"a".repeat(300)}`)],
    ["an empty string", ""],
  ])("drops %s and keeps the good path beside it", (_name, bad) => {
    const worlds = groupWorlds([bad, good]);
    expect(worlds.flatMap((world) => world.realms)).toEqual([good]);
  });

  it("never throws, whatever strings it is given", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 40 }), (paths) => {
        expect(Array.isArray(groupWorlds(paths))).toBe(true);
      }),
    );
  });
});
