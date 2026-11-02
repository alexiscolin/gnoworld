import { readFileSync } from "node:fs";
import { ANCHORS, worldLook, type Nature, type PlanetLook } from "@gnoworld/core";
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

// Variety is measured, not counted (ADR-0002 §3): each world has a feature vector, and a golden bounds the share of near-identical
// neighbours in any view, on the recorded list and on a synthetic universe ten times larger.
// A view of the cosmos holds about eight labelled worlds; every window of eight in id order keeps a system's worlds together.
const VIEW = 8;
const SAME_COLOUR = 6;
const SAME_SURFACE = 0.04;
// Measured on the code that lands, pinned so a change of rows or bytes shows: the found count exact, the shares as bounds a little over it.
const GOLDEN = { found: 62, share: 0.025, worst: 0.22, nudged: { token: 0.022, dao: 0.075, game: 0.025 } };

type Rgb = readonly [number, number, number];

function labOf([red, green, blue]: Rgb): Rgb {
  const linear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [linear(red), linear(green), linear(blue)];
  const curve = (value: number) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
  const x = curve((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = curve(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = curve((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const distance = (one: Rgb, other: Rgb) => Math.hypot(one[0] - other[0], one[1] - other[1], one[2] - other[2]);

// Two worlds alike at a glance: one class, one map, rings alike, the palette's centre under a just-seen step, the surface's numbers close.
function nearIdentical(one: PlanetLook, other: PlanetLook): boolean {
  return (
    one.anchor === other.anchor &&
    one.map === other.map &&
    (one.rings === null) === (other.rings === null) &&
    distance(labOf(one.ramp[1]), labOf(other.ramp[1])) < SAME_COLOUR &&
    Math.abs(one.warp.amount - other.warp.amount) < SAME_SURFACE &&
    Math.abs(one.secondShare - other.secondShare) < SAME_SURFACE * 4
  );
}

type NatureOf = (id: string) => Nature | null;

function closeness(ids: readonly string[], natureOf: NatureOf = () => null) {
  const looks = ids.map((id) => worldLook(id, natureOf(id)));
  const close = (at: number, other: number) => {
    const [one, two] = [looks[at], looks[other]];
    return one !== undefined && two !== undefined && nearIdentical(one, two) ? 1 : 0;
  };
  let pairs = 0;
  let found = 0;
  let worst = 0;
  for (let start = 0; start + VIEW <= looks.length; start += 1) {
    let inView = 0;
    for (let one = start; one < start + VIEW; one += 1)
      for (let two = one + 1; two < start + VIEW; two += 1) inView += close(one, two);
    worst = Math.max(worst, inView);
  }
  for (let one = 0; one < looks.length; one += 1)
    for (let two = one + 1; two < Math.min(one + VIEW, looks.length); two += 1) {
      pairs += 1;
      found += close(one, two);
    }
  return { share: found / pairs, worst: worst / ((VIEW * (VIEW - 1)) / 2), found };
}

const recordedIds = () => groupWorlds(ONYX).map((world) => world.id);
const tenTimes = (ids: readonly string[]) =>
  ids.flatMap((id) => Array.from({ length: 10 }, (_, n) => `${id}${String(n)}`));

describe("neighbours (ADR-0002 §3)", () => {
  it("draws every class from the recorded list, none past a fifth of it", () => {
    const anchors = recordedIds().map((id) => worldLook(id).anchor);
    expect(new Set(anchors)).toEqual(new Set(ANCHORS));
    for (const anchor of ANCHORS)
      expect(anchors.filter((one) => one === anchor).length / anchors.length, anchor).toBeLessThan(0.2);
  });

  it("keeps near-identical worlds a few in any view of the recorded list", () => {
    const { share, worst, found } = closeness(recordedIds());
    expect(found).toBe(GOLDEN.found);
    expect(share).toBeLessThan(GOLDEN.share);
    expect(worst).toBeLessThan(GOLDEN.worst);
  });

  it("keeps them a few in a universe ten times larger", () => {
    const { share, worst } = closeness(tenTimes(recordedIds()));
    expect(share).toBeLessThan(GOLDEN.share);
    expect(worst).toBeLessThan(GOLDEN.worst);
  });

  // A system's worlds sit together and often share a nature, so the nudge gathers the very neighbours this measures: each nature for all, then one per namespace.
  it.each(["token", "dao", "game"] as const)("holds when every world is a %s, the nudge at its worst", (nature) => {
    const { share } = closeness(recordedIds(), () => nature);
    expect(share).toBeLessThan(GOLDEN.nudged[nature]);
  });

  it("holds with a nature per namespace, in a universe ten times larger", () => {
    const natures = [null, "token", "dao", "game"] as const;
    const byNamespace: NatureOf = (id) => natures[(id.split("/")[0]?.length ?? 0) % natures.length] ?? null;
    expect(closeness(tenTimes(recordedIds()), byNamespace).share).toBeLessThan(GOLDEN.share);
  });

  it("finds a world near-identical to itself, or the bound above would hold for nothing", () => {
    const [id = ""] = recordedIds();
    expect(nearIdentical(worldLook(id), worldLook(id))).toBe(true);
    const world = worldLook(id);
    const twin = { ...world, warp: { ...world.warp, amount: world.warp.amount + 1 } };
    expect(nearIdentical(world, twin)).toBe(false);
  });

  it("gives names one digit apart no more alike a class than chance", () => {
    const row = Array.from({ length: 400 }, (_, n) => `samcrew/game${String(n)}`);
    const anchors = row.map((id) => worldLook(id).anchor);
    const same = anchors.filter((anchor, at) => anchor === anchors[at + 1]).length;
    expect(same / anchors.length).toBeLessThan(0.16);
  });
});
