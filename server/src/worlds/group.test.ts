import { readFileSync } from "node:fs";
import {
  alike,
  ANCHORS,
  featuresOf,
  NATURES,
  REALM_PREFIX,
  SURFACE,
  worldLook,
  worldRecipe,
  type Features,
  type Nature,
} from "@gnoworld/core";
import { RealmPath } from "@gnoworld/schemas/indexer";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { groupWorlds, keptPaths } from "./group.ts";

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

  it("keeps the first 512 realms of a world in sorted order and leaves the others out, the other worlds whole", () => {
    const many = Array.from({ length: 600 }, (_, i) => r(`evil/a_x${String(i).padStart(3, "0")}`));
    const worlds = keptPaths([...many, good]);
    expect(worlds).toHaveLength(513);
    expect(worlds).toContain(good);
    expect(worlds).toContain(many[511]);
    expect(worlds).not.toContain(many[512]);
  });

  it("never throws, whatever strings it is given", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 40 }), (paths) => {
        expect(Array.isArray(groupWorlds(paths))).toBe(true);
      }),
    );
  });
});

// Variety is measured, not counted (ADR-0002 §3, 7b4): `alike` says when a glance would take two worlds for one. A view draws up to 40 bodies,
// a window of 40 in id order a system's worlds; ADR §3 expects a few close pairs, never many: two in a view, a ten-thousandth of all pairs.
// Measured: none, here and ten times larger; class, minor, colour, rings and air alone leave 0.07% (the control); 7b's maps 0.93%.
const VIEW = 40;
const WORST_PAIRS = 2;
const SHARE = 0.0001;

type NatureOf = (id: string) => Nature | null;
type Shaped = (features: Features) => Features;

// The pairs alike among `count` worlds within `view` of each other in id order, and the most in any window of `view`.
function measured(count: number, view: number, close: (one: number, other: number) => boolean) {
  let pairs = 0;
  let found = 0;
  let worst = 0;
  for (let start = 0; start + view <= count; start += 1) {
    let inView = 0;
    for (let one = start; one < start + view; one += 1)
      for (let two = one + 1; two < start + view; two += 1) inView += close(one, two) ? 1 : 0;
    worst = Math.max(worst, inView);
  }
  for (let one = 0; one < count; one += 1)
    for (let two = one + 1; two < Math.min(one + view, count); two += 1) {
      pairs += 1;
      found += close(one, two) ? 1 : 0;
    }
  return { share: found / pairs, worst, found };
}

function closeness(ids: readonly string[], natureOf: NatureOf = () => null, shaped: Shaped = (features) => features) {
  const features = ids.map((id) => shaped(featuresOf(worldLook(id, natureOf(id)), worldRecipe(id, natureOf(id)))));
  return measured(features.length, VIEW, (at, other) => {
    const [one, two] = [features[at], features[other]];
    return one !== undefined && two !== undefined && alike(one, two);
  });
}

const recordedIds = () => groupWorlds(ONYX).map((world) => world.id);
const tenTimes = (ids: readonly string[]) =>
  ids.flatMap((id) => Array.from({ length: 10 }, (_, n) => `${id}${String(n)}`));

// F4108: the realm prefix a world's seed reads is written once, in core, and is the one the worlds' file accepts.
describe("the realm prefix", () => {
  it("is gno.land's realms', and the file's realm paths start with it", () => {
    expect(REALM_PREFIX).toBe("gno.land/r/");
    expect(RealmPath.safeParse(`${REALM_PREFIX}samcrew/memba`).success).toBe(true);
    expect(RealmPath.safeParse("gno.land/p/samcrew/memba").success).toBe(false);
    for (const { id, realms } of groupWorlds(ONYX))
      expect(realms.every((path) => path.startsWith(`${REALM_PREFIX}${id.split("/")[0] ?? ""}`))).toBe(true);
  });
});

describe("neighbours (ADR-0002 §3)", () => {
  it("draws every class from the recorded list, none past a fifth of it", () => {
    const anchors = recordedIds().map((id) => worldLook(id).anchor);
    expect(new Set(anchors)).toEqual(new Set(ANCHORS));
    for (const anchor of ANCHORS)
      expect(anchors.filter((one) => one === anchor).length / anchors.length, anchor).toBeLessThan(0.2);
  });

  it("keeps near-identical worlds a few in any view of the recorded list", () => {
    const { share, worst } = closeness(recordedIds());
    expect(share).toBeLessThan(SHARE);
    expect(worst).toBeLessThanOrEqual(WORST_PAIRS);
  });

  it("keeps them a few in a universe ten times larger", () => {
    const { share, worst } = closeness(tenTimes(recordedIds()));
    expect(share).toBeLessThan(SHARE);
    expect(worst).toBeLessThanOrEqual(WORST_PAIRS);
  }, 30_000);

  // A system's worlds sit together and often share a nature, so the nudge gathers the very neighbours this measures: each nature for all, then one per namespace.
  it.each([...NATURES])("holds when every world is a %s, the nudge at its worst", (nature) => {
    const { share, worst } = closeness(recordedIds(), () => nature);
    expect(share).toBeLessThan(SHARE);
    expect(worst).toBeLessThanOrEqual(WORST_PAIRS);
  });

  it("holds with a nature per namespace, in a universe ten times larger", () => {
    const natures = [null, ...NATURES] as const;
    const byNamespace: NatureOf = (id) => natures[(id.split("/")[0]?.length ?? 0) % natures.length] ?? null;
    const { share, worst } = closeness(tenTimes(recordedIds()), byNamespace);
    expect(share).toBeLessThan(SHARE);
    expect(worst).toBeLessThanOrEqual(WORST_PAIRS);
  }, 30_000);

  it("finds a world near-identical to itself, or the bound above would hold for nothing", () => {
    const [id = ""] = recordedIds();
    const recipe = worldRecipe(id);
    const world = featuresOf(worldLook(id), recipe);
    expect(alike(world, featuresOf(worldLook(id), worldRecipe(id)))).toBe(true);
    const [from, to] = SURFACE.scale.span;
    const twin = { ...recipe, surface: { ...recipe.surface, scale: recipe.surface.scale + (to - from) / 2 } };
    expect(alike(world, featuresOf(worldLook(id), twin))).toBe(false);
  });

  // The control: with every world's surface the same, class, minor class, colour, rings and air alone break the bound, so it reads the surface.
  it("would fail if the surface did not tell worlds apart", () => {
    const flat: Shaped = (features) => ({ ...features, shape: features.shape.map(() => 0) });
    const { share } = closeness(tenTimes(recordedIds()), () => null, flat);
    expect(share).toBeGreaterThan(SHARE * 3);
  }, 30_000);

  it("gives names one digit apart no more alike a class than chance", () => {
    const row = Array.from({ length: 400 }, (_, n) => `samcrew/game${String(n)}`);
    const anchors = row.map((id) => worldLook(id).anchor);
    const same = anchors.filter((anchor, at) => anchor === anchors[at + 1]).length;
    expect(same / anchors.length).toBeLessThan(0.16);
  });
});
