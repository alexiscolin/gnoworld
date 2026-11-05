import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MASS, MASS_KIND, massOf, type Clump, type Mass, type MassNamespace, type MassWorld } from "./mass.ts";
import type { Point } from "./cell.ts";

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

// Each clump of `before` stands in `after` where it stood, scaled by the factor its `sized`th clump's size read.
function keptTo(before: readonly Clump[], after: readonly Clump[], sized: number) {
  const scale = (after[sized]?.radius ?? NaN) / (before[sized]?.radius ?? NaN);
  before.forEach((clump, at) => {
    const moved = after[at];
    expect(moved?.radius, clump.id).toBeCloseTo(clump.radius * scale, 6);
    for (const axis of ["x", "y", "z"] as const)
      expect(moved?.centre[axis], `${clump.id} ${axis}`).toBeCloseTo(clump.centre[axis] * scale, 6);
  });
}

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

  // A golden, worked out once by this code (8n, after the push of the less used alone): any change to the layout's rule shows here.
  it("lays a small cosmos where it always has", () => {
    const mass = massOf([
      space("gnoland", [world("gnoland/home", 90), world("gnoland/blog", 20)], ["gno.land/p/gnoland/ui"]),
      space("demo", [world("demo/boards", 40)]),
      space("samcrew", [world("samcrew/a", 5), world("samcrew/b", 1)]),
    ]);
    const golden = [
      ["gnoland", 89.622, -139.025, 164.441, 66.76],
      ["demo", -76.82, 195.518, -106.649, 46.289],
      ["samcrew", -26.486, 216.595, 93.31, 58.321],
    ] as const;
    mass.clumps.forEach(({ id, centre, radius }, at) => {
      const [name, x, y, z, reach] = golden[at] ?? ["", NaN, NaN, NaN, NaN];
      expect(id).toBe(name);
      for (const [got, want] of [
        [centre.x, x],
        [centre.y, y],
        [centre.z, z],
        [radius, reach],
      ] as const)
        expect(got).toBeCloseTo(want, 2);
    });
    expect(mass.keys).toHaveLength(55);
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

  it("moves, with a new world, only the clumps ranked after its own: the ones before keep their places to the fit", () => {
    fc.assert(
      fc.property(namespaces(20), fc.nat(), (list, pick) => {
        const before = massOf(list);
        const grown = before.clumps[pick % before.clumps.length]?.id ?? "";
        const rank = before.clumps.findIndex(({ id }) => id === grown);
        const after = massOf(
          list.map((one) =>
            one.id === grown
              ? space(one.id, [...one.worlds, world(`${one.id}/new`, 0, { fresh: true })], one.packages)
              : one,
          ),
        );
        expect(after.clumps.map(({ id }) => id)).toEqual(before.clumps.map(({ id }) => id));
        // Each clump before it keeps its place up to the fit's one factor, read from a size no world changed (an empty one has none).
        const sized = before.clumps.slice(0, rank).findIndex(({ radius }) => radius > 0);
        fc.pre(sized >= 0);
        keptTo(before.clumps.slice(0, rank), after.clumps, sized);
      }),
      { numRuns: 60, seed: 20261105 },
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

// 8r: where StrykerJS found massOf loose (8n's run, 2026-11-05). The survivors no input tells apart are in 8r's report, with the reason.
describe("massOf's particles (8r)", () => {
  // A particle's place, size and tone, by its key.
  const particle = (mass: Mass, key: string) => {
    const at = mass.keys.indexOf(key);
    const [x, y, z] = [0, 1, 2].map((axis) => mass.positions[3 * at + axis] ?? NaN);
    return {
      x: x ?? NaN,
      y: y ?? NaN,
      z: z ?? NaN,
      size: mass.sizes[3 * at] ?? NaN,
      tone: mass.sizes[3 * at + 2] ?? NaN,
    };
  };
  // Offsets of `keys` from `from`, each axis over `reach`: a normal law's draws, mean 0 and spread 1.
  const offsets = (
    mass: Mass,
    keys: readonly string[],
    { from, reach }: { from: (key: string) => Point; reach: number },
  ) =>
    (["x", "y", "z"] as const).flatMap((axis) =>
      keys.map((key) => (particle(mass, key)[axis] - from(key)[axis]) / reach),
    );
  const expectNormal = (draws: readonly number[]) => {
    const mean = draws.reduce((sum, one) => sum + one, 0) / draws.length;
    const deviation = Math.sqrt(draws.reduce((sum, one) => sum + (one - mean) ** 2, 0) / draws.length);
    expect(Math.abs(mean)).toBeLessThan(0.1);
    expect(deviation).toBeGreaterThan(0.9);
    expect(deviation).toBeLessThan(1.1);
    // A normal law holds 68% of its draws within one deviation of its mean.
    const within = draws.filter((one) => Math.abs(one - mean) < deviation).length / draws.length;
    expect(within).toBeGreaterThan(0.63);
    expect(within).toBeLessThan(0.73);
  };
  const big = () =>
    space(
      "big",
      [world("big/w0", 5, { realms: Array.from({ length: 300 }, (_, at) => `gno.land/r/big/r${String(at)}`) })],
      Array.from({ length: 300 }, (_, at) => `gno.land/p/big/p${String(at)}`),
    );
  // The fit's scale: a clump's reach after it over its reach before, the root of its 601 real particles' volume.
  const bigMass = () => {
    const mass = massOf([big(), space("other", [world("other/w0", 1)])]);
    const clump = mass.clumps.find(({ id }) => id === "big");
    if (clump === undefined) throw new Error("no clump big");
    return { mass, clump, scale: clump.radius / (MASS.size * Math.cbrt(601)), spread: clump.radius * MASS.spread };
  };
  const keysFrom = (mass: Mass, start: string) => mass.keys.filter((key) => key.startsWith(start));

  it("spreads a clump's dust, its packages and a world's realms round their middles by normal laws of their own widths", () => {
    const { mass, clump, spread } = bigMass();
    expectNormal(offsets(mass, keysFrom(mass, "big#"), { from: () => clump.centre, reach: spread * 1.25 }));
    expectNormal(offsets(mass, keysFrom(mass, "gno.land/p/big/"), { from: () => clump.centre, reach: spread * 1.1 }));
    expectNormal(
      offsets(mass, keysFrom(mass, "gno.land/r/big/"), {
        from: () => particle(mass, "big/w0"),
        reach: spread * MASS.realmNear,
      }),
    );
  });

  it("varies realms and packages from 0.7 to 1.3 times their size and grains from 0.4 to 2 times theirs, after the fit", () => {
    const { mass, scale } = bigMass();
    for (const [start, size] of [
      ["gno.land/r/big/", MASS.realm],
      ["gno.land/p/big/", MASS.package],
    ] as const) {
      const shares = keysFrom(mass, start).map((key) => particle(mass, key).size / (size * scale));
      expect(Math.min(...shares)).toBeGreaterThanOrEqual(0.7 - 1e-4);
      expect(Math.max(...shares)).toBeLessThanOrEqual(1.3 + 1e-4);
      expect(Math.max(...shares) - Math.min(...shares)).toBeGreaterThan(0.5);
    }
    const grains = keysFrom(mass, "big#").map((key) => particle(mass, key).size / (MASS.grain * scale));
    expect(Math.min(...grains)).toBeGreaterThanOrEqual(0.4 - 1e-4);
    expect(Math.min(...grains)).toBeLessThan(0.5);
    expect(Math.max(...grains)).toBeLessThanOrEqual(2 + 1e-4);
    expect(Math.max(...grains)).toBeGreaterThan(1.8);
    expect(particle(mass, "earth").size / (MASS.earth * scale)).toBeCloseTo(1, 4);
  });

  it("gives each particle its own tone and each clump its own dust", () => {
    const { mass, clump } = bigMass();
    expect(new Set(mass.keys.map((key) => particle(mass, key).tone)).size).toBeGreaterThan(mass.keys.length / 2);
    const other = mass.clumps.find(({ id }) => id === "other");
    const [mine, theirs] = [particle(mass, "big#0"), particle(mass, "other#0")];
    expect(other).toBeDefined();
    const along = (one: Point, { centre, radius }: Clump) => (one.x - centre.x) / radius;
    expect(along(mine, clump)).not.toBeCloseTo(other === undefined ? NaN : along(theirs, other), 3);
  });

  it("ranks two namespaces of one score by their ids", () => {
    const mass = massOf([space("b", [world("b/w", 3)]), space("a", [world("a/w", 3)])]);
    expect(mass.clumps.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("pushes the less used of two overlapping clumps out just far enough to touch, along the line between them", () => {
    // Found by a search: these two namespaces' clumps overlap before the push.
    const worlds = (id: string, use: number) =>
      Array.from({ length: 6 }, (_, at) => world(`${id}/w${String(at)}`, use));
    const [first, second] = massOf([space("first", worlds("first", 9)), space("n18", worlds("n18", 1))]).clumps;
    if (first === undefined || second === undefined) throw new Error("two clumps");
    const apart = Math.hypot(
      second.centre.x - first.centre.x,
      second.centre.y - first.centre.y,
      second.centre.z - first.centre.z,
    );
    expect(apart / (first.radius + second.radius)).toBeCloseTo(1, 9);
  });

  // Goldens, worked out once by this code (8r): the places a normal law's sign or angle gives, and a seventh pass, change no rule above.
  it("lays a small cosmos's particles where they always have stood", () => {
    const mass = massOf([
      space("gnoland", [world("gnoland/home", 4, { realms: ["gno.land/r/gnoland/home"] })], ["gno.land/p/gnoland/ui"]),
    ]);
    const golden = [
      ["gnoland/home", 70.949, -190.048, 181.006],
      ["gno.land/r/gnoland/home", 61.879, -186.493, 173.9],
      ["gno.land/p/gnoland/ui", 108.219, -170.808, 184.452],
      ["gnoland#0", 66.99, -147.517, 171.089],
    ] as const;
    for (const [key, x, y, z] of golden) {
      const got = particle(mass, key);
      expect(got.x, key).toBeCloseTo(x, 2);
      expect(got.y, key).toBeCloseTo(y, 2);
      expect(got.z, key).toBeCloseTo(z, 2);
    }
  });

  it("pushes a crowd apart in six passes, a clump left where the sixth leaves it", () => {
    const crowd = Array.from({ length: 23 }, (_, at) =>
      space(
        `c${String(at)}`,
        [0, 1, 2, 3].map((w) => world(`c${String(at)}/w${String(w)}`, 1)),
      ),
    );
    const moved = massOf(crowd).clumps.find(({ id }) => id === "c9");
    expect(moved?.centre.x).toBeCloseTo(-83.466, 2);
    expect(moved?.centre.y).toBeCloseTo(-182.285, 2);
    expect(moved?.centre.z).toBeCloseTo(-6.952, 2);
  });
});
