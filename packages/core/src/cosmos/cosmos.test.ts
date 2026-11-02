import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { heightField, MAX_HEIGHT } from "../space/mood.ts";
import {
  CELL,
  DISC_HALF_THICKNESS,
  driftedPlaces,
  placeSystems,
  starSize,
  type SystemPlace,
  type SystemRef,
} from "./cosmos.ts";

// core/cosmos (slice 7, 7c and 7d1; ADR-0002 §3 and §10; F3520): systems take cells in rings by their rank in the set, a thick disc with
// clusters above and below it, their height from a smooth field of position. Nothing piles up, an arrival moves others little and only
// outward, and a curated ecosystem's namespaces sit together. Most numbers below are bounds on shape; the golden table pins real ones.
const ids = (count: number, prefix = "ns"): string[] =>
  Array.from({ length: count }, (_, i) => `${prefix}${String(i)}`);
const loose = (names: readonly string[]): SystemRef[] => names.map((id) => ({ id }));
const placed = (count: number, prefix = "ns"): Map<string, SystemPlace> => placeSystems(loose(ids(count, prefix)));
const horizontal = (p: { x: number; z: number }): number => Math.hypot(p.x, p.z);
const apart = (a: SystemPlace, b: SystemPlace): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const percentile = (values: number[], share: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
};
// Rings stand two cells apart, and a system strays under half a cell from its cell: its ring is its distance, rounded.
const ringOf = (p: SystemPlace): number => Math.round(horizontal(p) / (2 * CELL));

/** The closest two of a map, through a grid of cells: 10,000 systems make 50 million pairs. */
function closest(places: Iterable<SystemPlace>): number {
  const grid = new Map<string, SystemPlace[]>();
  const key = (x: number, z: number): string => `${String(x)}/${String(z)}`;
  const around = (x: number, z: number): SystemPlace[] =>
    [-1, 0, 1].flatMap((dx) => [-1, 0, 1].flatMap((dz) => grid.get(key(x + dx, z + dz)) ?? []));
  let least = Number.POSITIVE_INFINITY;
  for (const place of places) {
    const x = Math.floor(place.x / CELL);
    const z = Math.floor(place.z / CELL);
    for (const other of around(x, z)) least = Math.min(least, apart(place, other));
    grid.set(key(x, z), [...(grid.get(key(x, z)) ?? []), place]);
  }
  return least;
}

/** The systems of `before` that stand on an inner ring in `after`. */
const inward = (before: Map<string, SystemPlace>, after: Map<string, SystemPlace>): string[] =>
  [...before].filter(([id, place]) => ringOf(after.get(id) ?? { x: 0, y: 0, z: 0 }) < ringOf(place)).map(([id]) => id);

/** How far each system of `before` stands from its place in `after`. */
const moves = (before: Map<string, SystemPlace>, after: Map<string, SystemPlace>): number[] =>
  [...before].map(([id, place]) => apart(place, after.get(id) ?? { x: Infinity, y: 0, z: 0 }));

describe("placeSystems, a pure function of the set", () => {
  it("gives every system one finite place, and the same set the same places", () => {
    const set = loose(ids(500));
    const first = placeSystems(set);
    expect(first.size).toBe(500);
    for (const place of first.values()) expect(Object.values(place).every(Number.isFinite)).toBe(true);
    expect(placeSystems(set)).toEqual(first);
  });

  it("does not depend on the order the systems are given in", () => {
    const set = loose(ids(300));
    expect(placeSystems([...set].reverse())).toEqual(placeSystems(set));
  });

  it("gives a different system a different place", () => {
    const places = [...placed(1000).values()].map((p) => `${String(p.x)},${String(p.y)},${String(p.z)}`);
    expect(new Set(places).size).toBe(1000);
  });

  it("is the same for any ids, in any order (property)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 1, maxLength: 40 }),
        (names) => {
          const set = loose(names);
          expect(placeSystems([...set].reverse())).toEqual(placeSystems(set));
        },
      ),
    );
  });

  // Two ids and two ecosystems whose 32-bit hashes meet, found by search: the rank then falls to the name, or the order given would decide.
  it("breaks a tie of two systems' hashes by their names", () => {
    const tied = loose(["t1439599", "t1622382"]);
    expect(placeSystems([...tied].reverse())).toEqual(placeSystems(tied));
  });

  it("breaks a tie of two ecosystems' hashes by their names", () => {
    const tied = [
      { id: "a", ecosystem: "e1149599" },
      { id: "b", ecosystem: "e1312382" },
    ];
    expect(placeSystems([...tied].reverse())).toEqual(placeSystems(tied));
  });

  it("breaks a tie of two members' hashes by their names, inside one ecosystem", () => {
    const tied = [
      { id: "t1439599", ecosystem: "e" },
      { id: "t1622382", ecosystem: "e" },
      { id: "c", ecosystem: "e" },
    ];
    expect(placeSystems([...tied].reverse())).toEqual(placeSystems(tied));
  });

  // A tie on one ray: the first by UTF-16 units takes ring 1. "Z" comes before "a" there, and after it in any locale.
  it("orders a tie by UTF-16 units, as every engine does, not by a locale", () => {
    const places = placeSystems(loose(["a906", "Z245968"]));
    expect(ringOf(places.get("Z245968") ?? { x: 0, y: 0, z: 0 })).toBe(1);
    expect(ringOf(places.get("a906") ?? { x: 0, y: 0, z: 0 })).toBe(2);
  });
});

// By size: how round it stays and how much of it is full, measured on six families of ids, then a margin. A small disc's rim is most of it.
describe.each([
  [100, 0.45, 0.35],
  [1_000, 0.75, 0.6],
  [10_000, 0.8, 0.8],
])("at %i systems", (count, round, full) => {
  const ideal = (): number => Math.sqrt(count / 3);

  it("keeps any two systems a cell apart", () => {
    expect(closest(placed(count).values())).toBeGreaterThanOrEqual(CELL);
  });

  it("fills every ring well inside the rim: constant density, with no hole", () => {
    const rings = new Map<number, number>();
    for (const place of placed(count).values()) rings.set(ringOf(place), (rings.get(ringOf(place)) ?? 0) + 1);
    for (let ring = 1; ring <= full * ideal(); ring += 1) expect(rings.get(ring)).toBe(6 * ring);
  });

  it("thins at the rim, within a third of the disc's size: no spoke runs out", () => {
    const outermost = Math.max(...[...placed(count).values()].map(ringOf));
    expect(outermost).toBeLessThanOrEqual(1.34 * ideal() + 1);
  });

  it("stays round: each of eight sectors reaches about as far", () => {
    const reach = new Array<number>(8).fill(0);
    for (const place of placed(count).values()) {
      const sector = Math.floor(((Math.atan2(place.z, place.x) + Math.PI) / (2 * Math.PI)) * 8) % 8;
      reach[sector] = Math.max(reach[sector] ?? 0, horizontal(place));
    }
    expect(Math.min(...reach)).toBeGreaterThan(round * Math.max(...reach));
  });

  it("gives a place to every system, each on the disc", () => {
    const places = [...placed(count).values()];
    expect(places).toHaveLength(count);
    for (const place of places) expect(Math.abs(place.y)).toBeLessThanOrEqual(MAX_HEIGHT + DISC_HALF_THICKNESS);
  });
});

describe("no two systems closer than a cell", () => {
  const system = fc.record({
    id: fc.oneof(fc.string({ unit: "binary", maxLength: 12 }), fc.constantFrom("__proto__", "constructor", "toString")),
    ecosystem: fc.option(fc.constantFrom("defi", "games", "__proto__", "constructor"), { nil: undefined }),
  });
  const refs = fc
    .uniqueArray(system, { selector: ({ id }) => id, maxLength: 150 })
    .map((set) => set.map(({ id, ecosystem }) => (ecosystem === undefined ? { id } : { id, ecosystem })));

  it("for any set, loose or curated (property)", () => {
    fc.assert(
      fc.property(refs, (set) => {
        expect(closest(placeSystems(set).values())).toBeGreaterThanOrEqual(CELL);
      }),
    );
  });

  it("with the worst pairs of a ring's first cells: 7 systems, then 20", () => {
    for (const count of [7, 20]) expect(closest(placed(count).values())).toBeGreaterThanOrEqual(CELL);
  });

  it("leaves the centre to gno.land: no system within a cell of it", () => {
    fc.assert(
      fc.property(refs, (set) => {
        for (const place of placeSystems(set).values()) expect(horizontal(place)).toBeGreaterThanOrEqual(CELL);
      }),
    );
  });
});

describe("the disc, with constant density", () => {
  it("grows with the count instead of packing tighter: ten times the systems, about three times the radius", () => {
    const radius = (count: number) => percentile([...placed(count).values()].map(horizontal), 0.9);
    const ratio = radius(10_000) / radius(1_000);
    expect(ratio).toBeGreaterThan(2.8);
    expect(ratio).toBeLessThan(3.5);
  });

  it("is thick: most systems within the disc's half thickness, some above and some below, none past the field's bound", () => {
    const places = [...placed(3_000).values()];
    const outside = places.filter((p) => Math.abs(p.y) > DISC_HALF_THICKNESS);
    expect(outside.length / places.length).toBeGreaterThan(0.03);
    expect(outside.length / places.length).toBeLessThan(0.3);
    expect(places.some((p) => p.y > DISC_HALF_THICKNESS)).toBe(true);
    expect(places.some((p) => p.y < -DISC_HALF_THICKNESS)).toBe(true);
    for (const p of places) expect(Math.abs(p.y)).toBeLessThanOrEqual(MAX_HEIGHT + DISC_HALF_THICKNESS);
  });

  it("draws a system's height from the field at its position, within the disc's thickness of it", () => {
    const heights = [...placed(500).values()].map((p) => p.y - heightField(p.x, p.z));
    for (const lift of heights) expect(Math.abs(lift)).toBeLessThanOrEqual(DISC_HALF_THICKNESS);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(DISC_HALF_THICKNESS);
  });

  it("never shows its lattice: positions inside a cell are spread, not on its corners", () => {
    const places = [...placed(1_000).values()];
    for (const axis of ["x", "z"] as const) {
      const buckets = new Set(places.map((p) => Math.floor((((p[axis] % CELL) + CELL) % CELL) / (CELL / 10))));
      expect(buckets.size).toBeGreaterThanOrEqual(8);
    }
  });

  it("never shows its rings: a system strays from the ring by up to about a quarter of the way to the next", () => {
    const strays = [...placed(1_000).values()].map((p) => Math.abs(horizontal(p) / (2 * CELL) - ringOf(p)));
    expect(Math.max(...strays)).toBeGreaterThan(0.17);
    expect(Math.max(...strays)).toBeLessThan(0.25);
  });

  it("turns one ring against the next: where a cell sits in its arc changes from ring to ring", () => {
    const places = [...placed(1_000).values()];
    const inArc = (ring: number): number => {
      const arcs = places
        .filter((p) => ringOf(p) === ring)
        .map((p) => ((Math.atan2(p.z, p.x) / (2 * Math.PI)) * 6 * ring * 2 * Math.PI) % (2 * Math.PI));
      return Math.atan2(
        arcs.reduce((sum, a) => sum + Math.sin(a), 0),
        arcs.reduce((sum, a) => sum + Math.cos(a), 0),
      );
    };
    const seats = [4, 5, 6, 7, 8, 9, 10, 11].map(inArc);
    expect(Math.max(...seats) - Math.min(...seats)).toBeGreaterThan(Math.PI);
  });
});

describe("a hundred arrivals move no system far", () => {
  const set = (count: number): SystemRef[] => loose(ids(count));
  const arrivals = (): SystemRef[] => loose(ids(100, "new"));
  const measure = (before: SystemRef[], added: SystemRef[]) => {
    const places = moves(placeSystems(before), placeSystems([...before, ...added]));
    return {
      far: Math.max(...places),
      mean: places.reduce((sum, d) => sum + d, 0) / places.length,
      still: places.filter((d) => d === 0).length / places.length,
    };
  };

  // What the first draft of a rank did, a spiral of rings (the report's measure): 26, 52 and 182 cells at most.
  it.each([
    [100, 12, 4.5],
    [1_000, 16, 1.8],
    [10_000, 20, 0.6],
  ])("at %i systems, at most %i cells, %d on average", (count, far, mean) => {
    const moved = measure(set(count), arrivals());
    expect(moved.far).toBeLessThanOrEqual(far * CELL);
    expect(moved.mean).toBeLessThanOrEqual(mean * CELL);
  });

  it("leaves most of a large universe exactly where it was", () => {
    expect(measure(set(10_000), arrivals()).still).toBeGreaterThan(0.8);
  });

  it("whichever hundred come, at 1,000 systems (property)", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer(), { minLength: 100, maxLength: 100 }), (seeds) => {
        const moved = measure(set(1_000), loose(seeds.map((seed) => `arrival ${String(seed)}`)));
        expect(moved.far).toBeLessThanOrEqual(20 * CELL);
      }),
      { numRuns: 20 },
    );
  });

  it("with a curated ecosystem in the set, its members too", () => {
    const curated = ids(30, "defi").map((id) => ({ id, ecosystem: "defi" }));
    expect(measure([...set(1_000), ...curated], arrivals()).far).toBeLessThanOrEqual(16 * CELL);
  });

  it("when one joins a curated ecosystem", () => {
    const curated = ids(30, "defi").map((id) => ({ id, ecosystem: "defi" }));
    const joined = [{ id: "defi-new", ecosystem: "defi" }];
    expect(measure([...set(1_000), ...curated], joined).far).toBeLessThanOrEqual(16 * CELL);
  });

  it("only ever moves a system outward: a movement reads as growth", () => {
    const before = placed(1_000);
    const after = placeSystems(loose([...ids(1_000), ...ids(100, "new")]));
    for (const [id, place] of before) {
      const moved = after.get(id);
      expect(moved === undefined ? -1 : ringOf(moved)).toBeGreaterThanOrEqual(ringOf(place));
    }
  });

  it("only ever moves a curated ecosystem's members outward too, when loose systems arrive", () => {
    const curated = ids(30, "defi").map((id) => ({ id, ecosystem: "defi" }));
    const before = placeSystems([...set(1_000), ...curated]);
    const after = placeSystems([...set(1_000), ...curated, ...arrivals()]);
    expect(inward(before, after)).toEqual([]);
  });

  it("only ever moves others outward when one joins an ecosystem whose wedge stays on its rung", () => {
    const curated = ids(30, "defi").map((id) => ({ id, ecosystem: "defi" }));
    const before = placeSystems([...set(1_000), ...curated]);
    const after = placeSystems([...set(1_000), ...curated, { id: "defi-new", ecosystem: "defi" }]);
    expect(inward(before, after)).toEqual([]);
  });

  it("widens a wedge on its next rung, with no system going far", () => {
    const curated = ids(32, "defi").map((id) => ({ id, ecosystem: "defi" }));
    const joined = [{ id: "defi-new", ecosystem: "defi" }];
    expect(measure([...set(1_000), ...curated], joined).far).toBeLessThanOrEqual(32 * CELL);
  });

  it("only ever moves others inward when a system leaves: the same rule read backward", () => {
    const left = ids(500).filter((id) => id !== "ns250");
    expect(inward(placeSystems(loose(left)), placed(500))).toEqual([]);
  });

  it("gives a place back to what comes again: the same set, the same map", () => {
    const left = placeSystems(loose(ids(500).filter((id) => id !== "ns250")));
    expect(placeSystems(loose([...left.keys(), "ns250"]))).toEqual(placed(500));
  });
});

describe("driftedPlaces, what moved on its way over a season", () => {
  const from = new Map<string, SystemPlace>([
    ["a", { x: 0, y: 0, z: 0 }],
    ["b", { x: 10, y: 20, z: 30 }],
    ["gone", { x: 1, y: 1, z: 1 }],
  ]);
  const to = new Map<string, SystemPlace>([
    ["a", { x: 40, y: 8, z: -20 }],
    ["b", { x: 10, y: 20, z: 30 }],
    ["new", { x: 5, y: 5, z: 5 }],
  ]);

  it("stands at last season's map at its start and at this season's at its end", () => {
    expect(driftedPlaces(from, to, 0).get("a")).toEqual({ x: 0, y: 0, z: 0 });
    expect(driftedPlaces(from, to, 1).get("a")).toEqual({ x: 40, y: 8, z: -20 });
  });

  it("stands halfway at the season's middle, on all three axes", () => {
    expect(driftedPlaces(from, to, 0.5).get("a")).toEqual({ x: 20, y: 4, z: -10 });
  });

  it("starts and ends gently: no step at either end of the season", () => {
    const x = (progress: number): number => driftedPlaces(from, to, progress).get("a")?.x ?? NaN;
    expect(x(0.01)).toBeLessThan(0.02);
    expect(x(0.99)).toBeGreaterThan(39.98);
  });

  it("never passes either map, before or after the season", () => {
    expect(driftedPlaces(from, to, -1).get("a")).toEqual({ x: 0, y: 0, z: 0 });
    expect(driftedPlaces(from, to, 2).get("a")).toEqual({ x: 40, y: 8, z: -20 });
  });

  it("leaves what did not move, puts an arrival at its place at once, and forgets what left", () => {
    const places = driftedPlaces(from, to, 0.3);
    expect(places.get("b")).toEqual({ x: 10, y: 20, z: 30 });
    expect(places.get("new")).toEqual({ x: 5, y: 5, z: 5 });
    expect(places.has("gone")).toBe(false);
    expect(places.size).toBe(3);
  });

  it("refuses a progress that is no number, so no place turns to NaN in the scene", () => {
    expect(() => driftedPlaces(from, to, Number.NaN)).toThrow(
      new RangeError("cosmos: a season's progress is a number"),
    );
    expect(driftedPlaces(from, to, Number.POSITIVE_INFINITY).get("a")).toEqual({ x: 40, y: 8, z: -20 });
  });

  it("stands every system at its place when there is no last season, and leaves both maps as they were", () => {
    expect(driftedPlaces(new Map(), to, 0.5)).toEqual(to);
    expect(from.size).toBe(3);
    expect(to.get("a")).toEqual({ x: 40, y: 8, z: -20 });
  });

  it("carries a real map to the next with no step past a cell in a hundredth of a season", () => {
    const before = placed(1_000);
    const after = placeSystems(loose([...ids(1_000), ...ids(100, "new")]));
    const steps = moves(driftedPlaces(before, after, 0.5), driftedPlaces(before, after, 0.51));
    expect(Math.max(...steps)).toBeLessThan(CELL);
  });
});

describe("starSize: a star by the worlds it holds", () => {
  it.each([
    [1, 1],
    [2, 1.4],
    [3, 1.6],
    [4, 1.8],
    [6, 2],
    [8, 2.2],
    [12, 2.4],
    [512, 4.6],
    [1000, 4.98125],
    [1024, 5],
    [1025, 5],
    [1_000_000, 5],
    [Number.MAX_SAFE_INTEGER, 5],
  ])("holds %i worlds in a star of radius %d", (worlds, radius) => {
    expect(starSize(worlds)).toBeCloseTo(radius, 9);
  });

  it("grows with what it holds, and never shrinks (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4096 }), (worlds) => {
        expect(starSize(worlds + 1)).toBeGreaterThanOrEqual(starSize(worlds));
      }),
    );
    expect(starSize(512)).toBeGreaterThan(starSize(511));
  });

  it("never jumps: one world more moves a star by at most the step from 1 to 2", () => {
    for (let worlds = 1; worlds < 2048; worlds += 1) {
      expect(starSize(worlds + 1) - starSize(worlds)).toBeLessThanOrEqual(0.4 + 1e-9);
    }
  });

  it("gives two stars at their closest no touch, however much they hold", () => {
    const largest = starSize(Number.MAX_SAFE_INTEGER);
    expect(largest + largest).toBeLessThanOrEqual(closest(placed(1_000).values()));
    expect(2 * largest).toBeLessThanOrEqual(CELL);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60])(
    "refuses %j worlds with a RangeError",
    (worlds) => {
      expect(() => starSize(worlds)).toThrow(
        new RangeError("cosmos: a star holds a whole number of worlds, 1 or more"),
      );
    },
  );
});

describe("a curated ecosystem is placed together", () => {
  const members = ids(8, "defi").map((id) => ({ id, ecosystem: "defi" }));
  const maxPair = (set: SystemPlace[]) => Math.max(...set.flatMap((a) => set.map((b) => apart(a, b))));
  const of = (all: Map<string, SystemPlace>, names: readonly { id: string }[]): SystemPlace[] =>
    names.map(({ id }) => all.get(id)).filter((p) => p !== undefined);

  it("keeps the namespaces of one ecosystem near each other, well inside the disc", () => {
    const all = placeSystems([...loose(ids(400)), ...members]);
    const near = of(all, members);
    const wide = [...all.values()].map(horizontal);
    expect(near).toHaveLength(8);
    expect(maxPair(near)).toBeLessThan(0.4 * percentile(wide, 0.9));
  });

  it("keeps them nearer than eight loose systems of the same set", () => {
    const all = placeSystems([...loose(ids(400)), ...members]);
    expect(maxPair(of(all, members))).toBeLessThan(0.6 * maxPair(of(all, loose(ids(8)))));
  });

  it("puts an ecosystem whose rank comes first around the centre, spread over the whole turn", () => {
    const all = placeSystems(ids(40, "only").map((id) => ({ id, ecosystem: "only" })));
    const reach = [...all.values()].map(horizontal);
    expect(Math.max(...reach)).toBeLessThan(8 * 2 * CELL);
    expect(closest(all.values())).toBeGreaterThanOrEqual(CELL);
  });

  it("treats an ecosystem of one as a system of its own ray", () => {
    const alone = placeSystems([...loose(ids(100)), { id: "solo", ecosystem: "alone" }]);
    expect(closest(alone.values())).toBeGreaterThanOrEqual(CELL);
    expect(alone.get("solo")).toBeDefined();
  });

  it("moves a loose system little when another's ecosystem is named, the count unchanged", () => {
    const all = placeSystems([...loose(ids(400)), ...members]);
    const without = placeSystems([...loose(ids(400)), ...loose(ids(8, "defi"))]);
    const moved = moves(
      new Map(ids(400).flatMap((id) => [all.get(id)].filter((p) => p !== undefined).map((p) => [id, p] as const))),
      without,
    );
    expect(percentile(moved, 0.5)).toBeLessThanOrEqual(6 * CELL);
  });

  it("keeps an ecosystem of 300 systems one blob, neither a spoke nor a ring", () => {
    const big = ids(300, "big").map((id) => ({ id, ecosystem: "big" }));
    const cluster = of(placeSystems([...loose(ids(4_000)), ...big]), big);
    const sum = cluster.reduce((total, p) => ({ x: total.x + p.x, z: total.z + p.z }), { x: 0, z: 0 });
    const centre = { x: sum.x / cluster.length, z: sum.z / cluster.length };
    const away = cluster.map((p) => Math.hypot(p.x - centre.x, p.z - centre.z));
    expect(percentile(away, 0.9)).toBeLessThanOrEqual(2.5 * Math.sqrt(300) * CELL);
    const outward = { x: centre.x / horizontal(centre), z: centre.z / horizontal(centre) };
    const along = cluster.map((p) => Math.abs((p.x - centre.x) * outward.x + (p.z - centre.z) * outward.z));
    const across = cluster.map((p) => Math.abs((p.z - centre.z) * outward.x - (p.x - centre.x) * outward.z));
    const ratio = percentile(along, 0.9) / percentile(across, 0.9);
    expect(ratio).toBeGreaterThan(1 / 3);
    expect(ratio).toBeLessThan(3);
  });

  it("puts two ecosystems apart from each other", () => {
    const other = ids(8, "games").map((id) => ({ id, ecosystem: "games" }));
    const all = placeSystems([...loose(ids(400)), ...members, ...other]);
    const centre = (set: { id: string }[]) => {
      const p = of(all, set);
      return { x: p.reduce((s, q) => s + q.x, 0) / p.length, z: p.reduce((s, q) => s + q.z, 0) / p.length };
    };
    const a = centre(members);
    const b = centre(other);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(CELL);
  });

  it("keeps the spacing of an ecosystem of 300 systems among 400 loose ones: its cluster grows with its size", () => {
    const big = ids(300, "big").map((id) => ({ id, ecosystem: "big" }));
    const all = placeSystems([...loose(ids(400)), ...big]);
    expect(closest(all.values())).toBeGreaterThanOrEqual(CELL);
    const cluster = of(all, big);
    const first = cluster[0] ?? { x: 0, z: 0 };
    const spread = percentile(
      cluster.map((p) => Math.hypot(p.x - first.x, p.z - first.z)),
      0.9,
    );
    expect(spread).toBeGreaterThan(CELL * 3);
  });
});

// Golden: the map every device and every release draws, worked out apart from this code, in Python, a ray walked at a time. Changing one
// of these numbers is a deliberate change of the map (the hash, the density, the field), never a side effect: update it in a commit that
// says so. A tolerance of 1e-6 absorbs an engine's last bit of a sine, and nothing visible.
describe("golden coordinates", () => {
  const set = [
    ...loose([
      "gnoswap",
      "samcrew",
      "nym-moultest123",
      "g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx",
      "demo",
      "gnoland",
      "sys",
      "leon",
    ]),
    ...["r3v4", "onbloc", "varmeta"].map((id) => ({ id, ecosystem: "defi" })),
  ];

  it.each([
    ["sys", [-13.78854132, 1.245973353, -15.045882698]],
    ["varmeta", [-37.856034868, -1.177724706, -16.56802431]],
    ["r3v4", [-15.785056512, -1.97168562, 8.74200839]],
    ["onbloc", [-32.03706175, -1.541395906, 20.973674034]],
    ["gnoswap", [20.901908777, -2.284912251, -10.340452521]],
    ["nym-moultest123", [-39.693653406, 1.305684533, 6.851628079]],
    ["samcrew", [-4.353961855, 1.030364738, 22.124125104]],
    ["leon", [-16.048881854, -0.439412126, 37.742777871]],
    ["demo", [-23.88491381, -2.324080886, -35.148323671]],
    ["g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx", [-48.256894851, -0.39123538, -42.186987661]],
    ["gnoland", [-42.920955358, -0.451738803, 35.785442824]],
  ] as const)("puts %s at %j", (id, [x, y, z]) => {
    const place = placeSystems(set).get(id);
    expect(Math.abs((place?.x ?? NaN) - x)).toBeLessThan(1e-6);
    expect(Math.abs((place?.y ?? NaN) - y)).toBeLessThan(1e-6);
    expect(Math.abs((place?.z ?? NaN) - z)).toBeLessThan(1e-6);
  });
});

describe("the edges of the input", () => {
  it("places an empty set as an empty map", () => {
    expect(placeSystems([]).size).toBe(0);
  });

  it("counts a repeated id once and keeps the last ecosystem it names", () => {
    const twice = placeSystems([{ id: "a" }, { id: "a", ecosystem: "e" }, { id: "b" }]);
    expect(new Set(twice.keys())).toEqual(new Set(["a", "b"]));
    expect(twice).toEqual(placeSystems([{ id: "a", ecosystem: "e" }, { id: "b" }]));
  });

  it("tells a system from an ecosystem of the same name", () => {
    const set = [{ id: "same" }, { id: "other", ecosystem: "same" }, { id: "third", ecosystem: "same" }];
    expect(closest(placeSystems(set).values())).toBeGreaterThanOrEqual(CELL);
  });

  it.each([1, 2, 3])("places %i systems finitely", (count) => {
    const places = [...placed(count).values()];
    expect(places).toHaveLength(count);
    for (const place of places) expect(Object.values(place).every(Number.isFinite)).toBe(true);
  });

  it("takes the names an object would trip on as plain names", () => {
    const set = ["__proto__", "constructor", "toString", "hasOwnProperty"].flatMap((id) => [
      { id },
      { id: `${id} in`, ecosystem: id },
      { id: `${id} too`, ecosystem: id },
    ]);
    const places = placeSystems(set);
    expect(places.size).toBe(12);
    for (const place of places.values()) expect(Object.values(place).every(Number.isFinite)).toBe(true);
  });

  it("places an empty id, and an id of a megabyte, at finite places", () => {
    const places = placeSystems(loose(["", "x".repeat(1_000_000)]));
    expect(places.size).toBe(2);
    for (const place of places.values()) expect(Object.values(place).every(Number.isFinite)).toBe(true);
  });
});

// The worst rays a set can give, a whole set in one wedge, 45 ms measured: the test's own timeout is the bound (rings.test.ts says why).
describe("its cost: n log n at most, measured", () => {
  it("places 30,000 systems of one ecosystem, the worst its rays can do", () => {
    const places = placeSystems(ids(30_000).map((id) => ({ id, ecosystem: "one" })));
    expect(places.size).toBe(30_000);
    expect(closest(places.values())).toBeGreaterThanOrEqual(CELL);
  });
});
