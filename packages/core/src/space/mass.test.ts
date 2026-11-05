import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MASS, MASS_KIND, massOf, type Mass, type MassNamespace, type MassWorld } from "./mass.ts";

const world = (
  id: string,
  use = 0,
  { realms = [], fresh = false }: Partial<Omit<MassWorld, "id" | "use">> = {},
): MassWorld => ({
  id,
  realms,
  use,
  fresh,
});
const space = (id: string, worlds: readonly MassWorld[], packages: readonly string[] = []): MassNamespace => ({
  id,
  worlds,
  packages,
});

// Namespaces of random names, uses, realms and packages, ids unique as the worlds file's are.
const namespaces = (most: number) =>
  fc
    .uniqueArray(
      fc.record({
        id: fc.stringMatching(/^[a-z]{1,8}$/),
        worlds: fc.array(fc.record({ use: fc.nat(500), realms: fc.nat(3), fresh: fc.boolean() }), { maxLength: 6 }),
        packages: fc.nat(4),
      }),
      { selector: ({ id }) => id, minLength: 1, maxLength: most },
    )
    .map((list) =>
      list.map(({ id, worlds, packages }) =>
        space(
          id,
          worlds.map(({ use, realms, fresh }, at) =>
            world(`${id}/w${String(at)}`, use, {
              realms: Array.from({ length: realms }, (_, r) => `gno.land/r/${id}/w${String(at)}/r${String(r)}`),
              fresh,
            }),
          ),
          Array.from({ length: packages }, (_, p) => `gno.land/p/${id}/p${String(p)}`),
        ),
      ),
    );

// Each particle's key with its place, size and owner's id: what a key gets, whatever the order it is written in.
const byKey = (mass: Mass) =>
  new Map(
    mass.keys.map((key, at) => [
      key,
      [
        ...mass.positions.slice(3 * at, 3 * at + 3),
        ...mass.sizes.slice(3 * at, 3 * at + 3),
        mass.clumps[mass.owners[at] ?? -1]?.id ?? "earth",
      ],
    ]),
  );
const kindOf = (mass: Mass, key: string) => mass.sizes[3 * mass.keys.indexOf(key) + 1];
const reachOf = ({ clumps }: Mass) =>
  Math.max(...clumps.map(({ centre, radius }) => Math.hypot(centre.x, centre.y, centre.z) + radius));

describe("massOf", () => {
  it("gives the same data the same mass, in whatever order the namespaces and their worlds come", () => {
    fc.assert(
      fc.property(namespaces(12), (list) => {
        const turned = [...list].reverse().map((one) => space(one.id, [...one.worlds].reverse(), [...one.packages]));
        const [first, again, other] = [massOf(list), massOf(list), massOf(turned)];
        expect(again).toEqual(first);
        expect(byKey(other)).toEqual(byKey(first));
        expect(other.clumps.map(({ id, centre, radius }) => [id, centre, radius])).toEqual(
          first.clumps.map(({ id, centre, radius }) => [id, centre, radius]),
        );
      }),
      { numRuns: 40, seed: 20261105 },
    );
  });

  it("writes each world, realm and package once, of its kind, the Earth last at the middle", () => {
    const mass = massOf([
      space(
        "gnoland",
        [world("gnoland/home", 9, { realms: ["gno.land/r/gnoland/home"] }), world("gnoland/new", 0, { fresh: true })],
        ["gno.land/p/gnoland/ui"],
      ),
      space("demo", [world("demo/boards", 2)]),
    ]);
    expect(kindOf(mass, "gnoland/home")).toBe(MASS_KIND.world);
    expect(kindOf(mass, "gnoland/new")).toBe(MASS_KIND.fresh);
    expect(kindOf(mass, "gno.land/r/gnoland/home")).toBe(MASS_KIND.realm);
    expect(kindOf(mass, "gno.land/p/gnoland/ui")).toBe(MASS_KIND.package);
    expect(kindOf(mass, "demo/boards")).toBe(MASS_KIND.world);
    for (const key of [
      "gnoland/home",
      "gnoland/new",
      "gno.land/r/gnoland/home",
      "gno.land/p/gnoland/ui",
      "demo/boards",
    ])
      expect(mass.keys.filter((each) => each === key)).toHaveLength(1);
    const last = mass.keys.length - 1;
    expect(mass.keys[last]).toBe("earth");
    expect([...mass.positions.slice(3 * last)]).toEqual([0, 0, 0]);
    expect(mass.sizes[3 * last + 1]).toBe(MASS_KIND.earth);
    expect(mass.owners[last]).toBe(-1);
    expect(mass.positions).toHaveLength(3 * mass.keys.length);
    expect(mass.sizes).toHaveLength(3 * mass.keys.length);
    expect(mass.owners).toHaveLength(mass.keys.length);
  });

  it("ranks the clumps by use, the most used nearest the Earth, and marks each by its most used world", () => {
    const mass = massOf([
      space("quiet", [world("quiet/a", 1)]),
      space("busy", [world("busy/b", 90), world("busy/a", 40)]),
      space("mid", [world("mid/a", 10)], ["gno.land/p/mid/x"]),
    ]);
    expect(mass.clumps.map(({ id }) => id)).toEqual(["busy", "mid", "quiet"]);
    expect(mass.clumps.map(({ score }) => score)).toEqual([130, 11, 1]);
    const distances = mass.clumps.map(({ centre }) => Math.hypot(centre.x, centre.y, centre.z));
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    const busy = mass.clumps[0];
    const at = mass.keys.indexOf("busy/b");
    expect(busy?.landmark.x).toBeCloseTo(mass.positions[3 * at] ?? NaN, 3);
    expect(busy?.landmark.y).toBeCloseTo(mass.positions[3 * at + 1] ?? NaN, 3);
    expect(busy?.landmark.z).toBeCloseTo(mass.positions[3 * at + 2] ?? NaN, 3);
  });

  // A world's size grows with its use, slowly, to 2.2 times a quiet one's at the most; a realm and a package keep their own, varied a little.
  it("sizes a world by its use, to a cap, after the fit", () => {
    const mass = massOf([space("a", [world("a/quiet", 0), world("a/busy", 1e9), world("a/mid", 15)])]);
    const size = (key: string) => mass.sizes[3 * mass.keys.indexOf(key)] ?? NaN;
    expect(size("a/busy") / size("a/quiet")).toBeCloseTo(2.2, 6);
    expect(size("a/mid") / size("a/quiet")).toBeCloseTo(1 + Math.log2(16) / 4, 6);
  });

  it("fits the farthest clump's edge to the dive's first view, whatever it holds", () => {
    fc.assert(
      fc.property(namespaces(30), (list) => {
        expect(reachOf(massOf(list))).toBeCloseTo(MASS.reach, 6);
      }),
      { numRuns: 40, seed: 20261105 },
    );
    expect(massOf([]).keys).toEqual(["earth"]);
  });

  it("leaves no two clumps overlapping once pushed apart", () => {
    fc.assert(
      fc.property(namespaces(400), (list) => {
        const { clumps } = massOf(list);
        for (const [at, a] of clumps.entries())
          for (const b of clumps.slice(at + 1)) {
            const gap = Math.hypot(b.centre.x - a.centre.x, b.centre.y - a.centre.y, b.centre.z - a.centre.z);
            expect(gap, `${a.id} and ${b.id}`).toBeGreaterThanOrEqual((a.radius + b.radius) * MASS.gap * 0.999);
          }
      }),
      { numRuns: 30, seed: 20261105 },
    );
  });

  it("holds the dust to its most at 20,000 worlds, every real particle kept", () => {
    const list = Array.from({ length: 2000 }, (_, n) =>
      space(
        `ns${String(n)}`,
        Array.from({ length: 10 }, (_, w) => world(`ns${String(n)}/w${String(w)}`, (n * 7 + w) % 50)),
      ),
    );
    const mass = massOf(list);
    const dust = mass.keys.filter((_, at) => mass.sizes[3 * at + 1] === MASS_KIND.dust).length;
    expect(dust).toBeLessThanOrEqual(MASS.dustMost + mass.clumps.length / 2);
    expect(dust).toBeGreaterThan(MASS.dustMost - mass.clumps.length / 2);
    expect(mass.keys.length - dust - 1).toBe(20_000);
  });

  it("gives a small cosmos its full dust, eight grains for each real particle", () => {
    const mass = massOf([space("one", [world("one/a", 3, { realms: ["gno.land/r/one/a"] })], ["gno.land/p/one/x"])]);
    const dust = mass.keys.filter((key) => key.startsWith("one#"));
    expect(dust).toHaveLength(3 * MASS.dust);
    expect(dust.every((key) => kindOf(mass, key) === MASS_KIND.dust)).toBe(true);
  });
});
