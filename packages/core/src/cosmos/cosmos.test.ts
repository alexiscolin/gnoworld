import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CELL, DISC_HALF_THICKNESS, heightField, MAX_HEIGHT, placeSystem, placeSystems } from "./cosmos.ts";

// core/cosmos (slice 7, 7c; ADR-0002 §3 and §10): systems sit in a thick disc, with clusters above and below it, their height from
// a smooth field of position, so no list of clusters. Placing one system depends on no other, density is constant, and a curated
// ecosystem's namespaces sit together. Most numbers below are bounds on shape; the golden tables at the end pin real coordinates.
const ids = (count: number, prefix = "ns"): string[] =>
  Array.from({ length: count }, (_, i) => `${prefix}${String(i)}`);
const horizontal = (p: { x: number; z: number }): number => Math.hypot(p.x, p.z);
const percentile = (values: number[], share: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
};

describe("placeSystems, a pure function of the set", () => {
  it("gives every system one finite place, and the same set the same places", () => {
    const set = ids(500).map((id) => ({ id }));
    const first = placeSystems(set);
    expect(first.size).toBe(500);
    for (const place of first.values()) expect(Object.values(place).every(Number.isFinite)).toBe(true);
    expect(placeSystems(set)).toEqual(first);
  });

  it("does not depend on the order the systems are given in", () => {
    const set = ids(300).map((id) => ({ id }));
    expect(placeSystems([...set].reverse())).toEqual(placeSystems(set));
  });

  it("places one system alone as it places it in the set: placing one depends on no other", () => {
    const set = ids(400).map((id) => ({ id }));
    const all = placeSystems(set);
    for (const id of ["ns0", "ns17", "ns399"]) expect(placeSystem(id, { count: 400 })).toEqual(all.get(id));
  });

  it("leaves a system where it is when other systems are swapped for others, the count unchanged", () => {
    const common = ids(200).map((id) => ({ id }));
    const withA = placeSystems([...common, ...ids(50, "left").map((id) => ({ id }))]);
    const withB = placeSystems([...common, ...ids(50, "right").map((id) => ({ id }))]);
    for (const { id } of common) expect(withA.get(id)).toEqual(withB.get(id));
  });

  it("moves nothing within one step of the power-of-two ladder, and grows the disc past it", () => {
    const small = placeSystems(ids(600).map((id) => ({ id })));
    const same = placeSystems(ids(1000).map((id) => ({ id })));
    for (const id of ids(600)) expect(same.get(id)).toEqual(small.get(id));
    const bigger = placeSystems(ids(1100).map((id) => ({ id })));
    expect(ids(600).some((id) => JSON.stringify(bigger.get(id)) !== JSON.stringify(small.get(id)))).toBe(true);
  });

  it("gives a different system a different place", () => {
    const places = [...placeSystems(ids(1000).map((id) => ({ id }))).values()].map(
      (p) => `${String(p.x)},${String(p.y)},${String(p.z)}`,
    );
    expect(new Set(places).size).toBe(1000);
  });

  it("is the same for any ids, in any order (property)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 1, maxLength: 40 }),
        (names) => {
          const set = names.map((id) => ({ id }));
          expect(placeSystems([...set].reverse())).toEqual(placeSystems(set));
          for (const name of names)
            expect(placeSystem(name, { count: names.length })).toEqual(placeSystems(set).get(name));
        },
      ),
    );
  });
});

describe("the disc, with constant density", () => {
  it("grows with the count instead of packing tighter: ten times the systems, about twice the radius at the same share", () => {
    const radius = (count: number) =>
      percentile([...placeSystems(ids(count).map((id) => ({ id }))).values()].map(horizontal), 0.9);
    const ratio = radius(10_000) / radius(1_000);
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(5);
  });

  it("keeps the spacing: few systems closer than a tenth of a cell, at 100, 1,000 and 5,000 systems", () => {
    for (const count of [100, 1_000, 5_000]) {
      const places = [...placeSystems(ids(count).map((id) => ({ id }))).values()];
      const near = places.filter((a, i) =>
        places.some((b, j) => j !== i && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < CELL / 10),
      );
      expect(near.length / count).toBeLessThan(0.03);
    }
  });

  it("is thick: most systems within the disc's half thickness, some above and some below, none past the field's bound", () => {
    const places = [...placeSystems(ids(3_000).map((id) => ({ id }))).values()];
    const outside = places.filter((p) => Math.abs(p.y) > DISC_HALF_THICKNESS);
    expect(outside.length / places.length).toBeGreaterThan(0.03);
    expect(outside.length / places.length).toBeLessThan(0.3);
    expect(places.some((p) => p.y > DISC_HALF_THICKNESS)).toBe(true);
    expect(places.some((p) => p.y < -DISC_HALF_THICKNESS)).toBe(true);
    for (const p of places) expect(Math.abs(p.y)).toBeLessThanOrEqual(MAX_HEIGHT + DISC_HALF_THICKNESS);
  });

  it("draws a system's height from the field at its position, within the disc's thickness of it", () => {
    for (const [, p] of placeSystems(ids(500).map((id) => ({ id })))) {
      expect(Math.abs(p.y - heightField(p.x, p.z))).toBeLessThanOrEqual(DISC_HALF_THICKNESS);
    }
  });

  it("never shows its lattice: positions inside a cell are spread, not on its corners", () => {
    const places = [...placeSystems(ids(1_000).map((id) => ({ id }))).values()];
    for (const axis of ["x", "z"] as const) {
      const buckets = new Set(places.map((p) => Math.floor((((p[axis] % CELL) + CELL) % CELL) / (CELL / 10))));
      expect(buckets.size).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("heightField, a smooth field of position", () => {
  const points = fc.tuple(
    fc.double({ min: -1e5, max: 1e5, noNaN: true }),
    fc.double({ min: -1e5, max: 1e5, noNaN: true }),
  );

  it("is a pure function, bounded by MAX_HEIGHT, at any coordinate", () => {
    fc.assert(
      fc.property(points, ([x, z]) => {
        expect(heightField(x, z)).toBe(heightField(x, z));
        expect(Math.abs(heightField(x, z))).toBeLessThanOrEqual(MAX_HEIGHT);
      }),
    );
    expect(Number.isFinite(heightField(1e9, -1e9))).toBe(true);
  });

  it("changes by at most half the distance moved, for a step of up to a cell: a small step, a small change", () => {
    fc.assert(
      fc.property(
        points,
        fc.double({ min: 0, max: Math.PI * 2, noNaN: true }),
        fc.double({ min: 0, max: CELL, noNaN: true }),
        ([x, z], angle, d) => {
          const moved = heightField(x + d * Math.cos(angle), z + d * Math.sin(angle));
          expect(Math.abs(moved - heightField(x, z))).toBeLessThanOrEqual(0.5 * d + 1e-9);
        },
      ),
    );
  });

  it("is no constant and no list: it rises and falls across the plane, with no jump, above and below zero", () => {
    const samples = Array.from({ length: 4_000 }, (_, i) =>
      heightField((i % 80) * CELL * 1.5, Math.floor(i / 80) * CELL * 1.5),
    );
    expect(Math.max(...samples)).toBeGreaterThan(DISC_HALF_THICKNESS);
    expect(Math.min(...samples)).toBeLessThan(-DISC_HALF_THICKNESS);
    expect(new Set(samples.map((h) => h.toFixed(3))).size).toBeGreaterThan(1_000);
  });
});

describe("a curated ecosystem is placed together", () => {
  const loose = ids(400).map((id) => ({ id }));
  const members = ids(8, "defi").map((id) => ({ id, ecosystem: "defi" }));
  const maxPair = (set: { x: number; y: number; z: number }[]) =>
    Math.max(...set.flatMap((a) => set.map((b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z))));

  it("keeps the namespaces of one ecosystem near each other, well inside the disc", () => {
    const all = placeSystems([...loose, ...members]);
    const near = members.map(({ id }) => all.get(id)).filter((p) => p !== undefined);
    const wide = [...all.values()].map(horizontal);
    expect(near).toHaveLength(8);
    expect(maxPair(near)).toBeLessThan(0.4 * percentile(wide, 0.9));
  });

  it("leaves the systems with no ecosystem exactly where they would be without it, and each member where it is alone", () => {
    const all = placeSystems([...loose, ...members]);
    const without = placeSystems([...loose, ...ids(8, "defi").map((id) => ({ id }))]);
    for (const { id } of loose) expect(all.get(id)).toEqual(without.get(id));
    for (const { id } of members)
      expect(all.get(id)).toEqual(placeSystem(id, { count: 408, ecosystem: "defi", ecosystemSize: 8 }));
  });

  it("puts two ecosystems apart from each other, and a member at the same place whatever the others", () => {
    const other = ids(8, "games").map((id) => ({ id, ecosystem: "games" }));
    const all = placeSystems([...loose, ...members, ...other]);
    const centre = (set: { id: string }[]) => {
      const p = set.map(({ id }) => all.get(id)).filter((q) => q !== undefined);
      return { x: p.reduce((s, q) => s + q.x, 0) / p.length, z: p.reduce((s, q) => s + q.z, 0) / p.length };
    };
    const a = centre(members);
    const b = centre(other);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(CELL);
  });
});

// Golden: the map every device and every release draws. Changing one of these numbers is a deliberate change of the map (the hash,
// the density, the field), never a side effect: update it in a commit that says so. A tolerance of 1e-6 absorbs an engine's last
// bit and nothing visible.
describe("golden coordinates", () => {
  const near = (actual: number, expected: number): void => {
    expect(Math.abs(actual - expected)).toBeLessThan(1e-6);
  };

  it.each([
    ["gnoswap/pool", { count: 1 }, [-7.406018839, -6.845249604, -0.860791713]],
    ["samcrew/memba", { count: 1 }, [-0.534895952, -6.383559154, 10.192181444]],
    ["gnoswap/pool", { count: 1024 }, [-236.992602869, -2.673548041, -27.545334826]],
    ["samcrew/memba", { count: 1024 }, [-17.116670468, -1.476378733, 326.149806236]],
    ["nym-moultest123/x/daily/counter", { count: 1024 }, [264.671009162, 0.099507246, 238.958425998]],
    ["g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx", { count: 1024 }, [-252.851034446, 0.390869718, -239.002841942]],
    ["gnoswap/pool", { count: 1025 }, [-335.15815316, -1.768801913, -38.954986093]],
    ["samcrew/memba", { count: 1025 }, [-24.206627519, -1.829359676, 461.245479343]],
    ["nym-moultest123/x/daily/counter", { count: 1025 }, [374.301330724, 0.681934715, 337.93824689]],
    [
      "gnoswap/pool",
      { count: 1025, ecosystem: "defi", ecosystemSize: 40 },
      [88.727466711, -1.765975015, 233.256339888],
    ],
    [
      "samcrew/memba",
      { count: 1025, ecosystem: "defi", ecosystemSize: 40 },
      [132.184263526, -1.47528687, 303.161480012],
    ],
  ] as const)("puts %s with %j at %j", (id, options, [x, y, z]) => {
    const place = placeSystem(id, options);
    near(place.x, x);
    near(place.y, y);
    near(place.z, z);
  });

  it("moves a system when the set passes a power of two: 1024 against 1025", () => {
    expect(placeSystem("gnoswap/pool", { count: 1024 }).x).not.toBeCloseTo(
      placeSystem("gnoswap/pool", { count: 1025 }).x,
      3,
    );
  });

  it.each([
    [0, 0, -5.078978803],
    [10, 10, -4.791517148],
    [123.5, -456.25, 0.211824855],
    [-1500, 2200, -0.001226415],
    [-37.5, -37.5, -3.686633044],
    [800, 800, -1.117668609],
    [1e5, -1e5, 1.82288683],
    [1e9, -1e9, -0.009052538],
  ])("gives the field at (%j, %j) as %j", (x, z, expected) => {
    near(heightField(x, z), expected);
  });
});

describe("the edges of the input", () => {
  const set = (...names: string[]) => names.map((id) => ({ id }));

  it("places an empty set as an empty map", () => {
    expect(placeSystems([]).size).toBe(0);
  });

  it("counts a repeated id once and keeps the last ecosystem it names", () => {
    const twice = placeSystems([{ id: "a" }, { id: "a", ecosystem: "e" }, { id: "b" }]);
    expect([...twice.keys()]).toEqual(["a", "b"]);
    expect(twice.get("a")).toEqual(placeSystem("a", { count: 2, ecosystem: "e", ecosystemSize: 1 }));
  });

  it.each([0, 1, 2, 3])("places one system among %j finitely", (count) => {
    const place = placeSystem("solo", { count });
    expect(Object.values(place).every(Number.isFinite)).toBe(true);
  });

  it("places a count of a trillion finitely, its disc growing with the square root", () => {
    const place = placeSystem("solo", { count: 1e12 });
    expect(Object.values(place).every(Number.isFinite)).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 2 ** 60])(
    "refuses a count of %j with a RangeError",
    (count) => {
      expect(() => placeSystem("a", { count })).toThrow(RangeError);
    },
  );

  it.each([0, -1, 1.5, Number.NaN])("refuses an ecosystem of %j systems with a RangeError", (ecosystemSize) => {
    expect(() => placeSystem("a", { count: 1, ecosystem: "e", ecosystemSize })).toThrow(RangeError);
  });

  it("places an empty id, and an id of a megabyte, at finite places", () => {
    for (const id of ["", "x".repeat(1_000_000)])
      expect(Object.values(placeSystem(id, { count: 10 })).every(Number.isFinite)).toBe(true);
    expect(placeSystems(set("")).size).toBe(1);
  });

  it("keeps the spacing of an ecosystem of 300 systems among 400 loose ones: its cluster grows with its size", () => {
    const members = ids(300, "big").map((id) => ({ id, ecosystem: "big" }));
    const all = placeSystems([...ids(400).map((id) => ({ id })), ...members]);
    const places = [...all.values()];
    const close = places.filter((a, i) =>
      places.some((b, j) => j !== i && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < CELL / 10),
    );
    expect(close.length / places.length).toBeLessThan(0.03);
    const cluster = members.map(({ id }) => all.get(id)).filter((p) => p !== undefined);
    const first = cluster[0] ?? { x: 0, z: 0 };
    const spread = percentile(
      cluster.map((p) => Math.hypot(p.x - first.x, p.z - first.z)),
      0.9,
    );
    expect(spread).toBeGreaterThan(CELL * 3);
  });
});
