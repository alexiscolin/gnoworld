import { describe, expect, it } from "vitest";
import { CELL } from "../cosmos/cosmos.ts";
import { BELT_INNER, GRAIN, systemsOf, type Orbiter, type StarSystem } from "../cosmos/system.ts";
import { orbitPlace } from "./disc.ts";
import { postcardFrom, postcardOf, postcardWorlds } from "./postcard.ts";

// A system made by hand: its worlds' radii, orbits and phases as given, its plane flat unless said.
const systemOf = (
  worlds: readonly [radius: number, orbit: number, phase: number][],
  tilt = 0,
  node = 0,
): StarSystem => ({
  id: "s",
  place: { x: 0, y: 0, z: 0 },
  star: 1,
  warmth: 0.5,
  spin: 0.1,
  belt: false,
  tilt,
  node,
  worlds: worlds.map(([radius, orbit, phase], at) => ({ id: `s/${String(at)}`, radius, orbit, phase })),
});

const placeOf = ({ orbit, phase }: Orbiter) => ({ x: orbit * Math.cos(phase), y: orbit * Math.sin(phase) });

describe("a postcard's worlds", () => {
  it("draws four worlds of one size, evenly round their star, as no figure: two at most", () => {
    const even = systemOf([0, 1, 2, 3].map((at) => [0.5, 1.5, (at * Math.PI) / 2]));
    expect(postcardWorlds(even).length).toBeLessThanOrEqual(2);
  });

  it("draws three whose gaps differ, each at its own phase and size, its orbit widened as the others are", () => {
    const system = systemOf([
      [0.6, 1.0, 0.2],
      [0.4, 1.8, 2.1],
      [0.3, 2.5, 4.4],
    ]);
    const worlds = postcardWorlds(system);
    expect(worlds).toHaveLength(3);
    const widened = worlds.map((world, at) => {
      const own = system.worlds[at];
      expect(world.phase).toBe(own?.phase);
      expect(world.radius).toBe(own?.radius);
      return world.orbit / (own?.orbit ?? NaN);
    });
    for (const spread of widened) expect(spread).toBeCloseTo(widened[0] ?? NaN, 12);
    expect(widened[0]).toBeGreaterThanOrEqual(1);
  });

  it("leaves a third of the smaller one's width between two worlds, seen half open, as the system turns", () => {
    const worlds = postcardWorlds(
      systemOf([
        [0.6, 1.0, 0.2],
        [0.4, 1.8, 2.1],
        [0.3, 2.5, 4.4],
      ]),
    );
    worlds.forEach((one, at) => {
      for (const other of worlds.slice(at + 1)) {
        const [a, b] = [placeOf(one), placeOf(other)];
        const air = Math.hypot(a.x - b.x, a.y - b.y) * 0.5 - one.radius - other.radius;
        expect(air).toBeGreaterThanOrEqual((2 / 3) * Math.min(one.radius, other.radius));
      }
    });
  });

  it("keeps its worlds within half a cell of its star, drawing fewer where all would pass it", () => {
    const wide = systemOf([
      [1.2, 1.0, 0.1],
      [0.8, 1.1, 0.4],
      [0.5, 1.2, 0.7],
    ]);
    const worlds = postcardWorlds(wide);
    expect(worlds.length).toBeLessThan(3);
    for (const { orbit, radius } of worlds) expect(orbit + radius).toBeLessThanOrEqual(CELL / 2);
  });

  // 7d6's design review: a world of one sat on its star, its edge 12 px from the star's white heart (f0004's stand 50 to 73 px from theirs).
  it("keeps each world off its star: its centre three of its radii from the star, or as far as its cell lets it", () => {
    const large = postcardWorlds(systemOf([[1.5, 1.2, 0.4]]));
    expect(large).toHaveLength(1);
    expect(large[0]?.orbit).toBeCloseTo(CELL / 2 - 1.5, 12);
    for (const system of [
      systemOf([[1.05, 1.2, 0.4]]),
      systemOf([
        [0.6, 0.5, 0.2],
        [0.4, 1.8, 2.1],
        [0.3, 2.5, 4.4],
      ]),
    ]) {
      const worlds = postcardWorlds(system);
      expect(worlds.length).toBeGreaterThan(0);
      for (const { orbit, radius } of worlds) expect(orbit).toBeGreaterThanOrEqual(3 * radius - 1e-9);
    }
  });

  // 7d3, no debris near a planet: widened past it, a world would stand in its system's far belt, among the rocks.
  it("keeps a belted system's worlds inside the belt's inner edge, off their star as far as that leaves them", () => {
    const [one, three] = [
      systemOf([[1.5, 1.2, 0.4]]),
      systemOf([
        [0.6, 1.0, 0.2],
        [0.4, 1.8, 2.1],
        [0.3, 2.5, 4.4],
      ]),
    ];
    // Unbelted, the room is its cell's half: the large world goes past the belt's edge.
    expect(postcardWorlds(one)[0]?.orbit).toBeCloseTo(CELL / 2 - 1.5, 12);
    expect(postcardWorlds({ ...one, belt: true })[0]?.orbit).toBeCloseTo(BELT_INNER - 1.5, 12);
    for (const system of [one, three]) {
      const worlds = postcardWorlds({ ...system, belt: true });
      expect(worlds.length).toBeGreaterThan(0);
      for (const { orbit, radius } of worlds) expect(orbit + radius).toBeLessThanOrEqual(BELT_INNER + 1e-9);
    }
  });

  // 7d6's review (lots 3 and 4): the 15% rule and the eight largest at their limits. Worlds 0.3 across on an orbit of 3 keep it as it
  // is (each off its star, the nearest two 3 apart), so two at `arc` apart leave a gap of `6·sin(arc/2) − 0.6` between them.
  const arcFor = (gap: number) => 2 * Math.asin((gap + 0.6) / 6);
  const onOrbit = (phases: readonly number[]) => systemOf(phases.map((phase) => [0.3, 3, phase]));

  it("refuses three worlds whose gaps differ by a tenth, and draws three whose gaps differ by a fifth, their orbits kept", () => {
    const [first, tenth, fifth] = [arcFor(3), arcFor(2.7), arcFor(2.4)];
    expect(postcardWorlds(onOrbit([0, first, first + tenth]))).toHaveLength(2);
    const drawn = postcardWorlds(onOrbit([0, first, first + fifth]));
    expect(drawn).toHaveLength(3);
    for (const { orbit } of drawn) expect(orbit).toBe(3);
  });

  it("reads the gaps between neighbours round the star, whatever order its worlds come in", () => {
    // Round the star at 0, 0.8, 2 and 3.7: gaps 1.74, 2.79, 3.91 and 5.17, no two alike.
    expect(postcardWorlds(onOrbit([0, 2, 0.8, 3.7]))).toHaveLength(4);
  });

  it("chooses among its eight largest worlds: the eighth drawn, the ninth never", () => {
    // Seven larger worlds past the cell's half, never drawn; the eighth and the ninth would stand apart, the ninth listed first.
    const larger = Array.from({ length: 7 }, (_, at): [number, number, number] => [0.5 + 0.05 * at, 4.8, at]);
    const drawn = postcardWorlds(systemOf([[0.31, 1.5, Math.PI], [0.4, 1, 0], ...larger]));
    expect(drawn.map(({ radius }) => radius)).toEqual([0.4]);
  });

  it("draws nothing as a body of grain alone, and four at most", () => {
    expect(postcardWorlds(systemOf([[0.1, 1, 0]]))).toEqual([]);
    const many = systemOf(Array.from({ length: 12 }, (_, at) => [0.3 + at * 0.08, 0.8 + at * 0.1, at * 1.3]));
    expect(postcardWorlds(many).length).toBeLessThanOrEqual(4);
  });
});

describe("a postcard's worlds at a count", () => {
  it("chooses as many as asked at most, by the same rules: as no figure, apart, within the cell", () => {
    const four = systemOf(
      [
        [0.6, 1.0, 0.2],
        [0.4, 1.8, 2.1],
        [0.5, 2.5, 4.4],
        [0.35, 3.1, 5.3],
      ],
      0.3,
      1.1,
    );
    const all = postcardWorlds(four);
    expect(all.length).toBeGreaterThan(2);
    for (let most = all.length; most > 0; most -= 1) {
      const some = postcardWorlds(four, most);
      expect(some.length).toBeLessThanOrEqual(most);
      expect(some.length).toBeGreaterThan(0);
    }
    expect(postcardWorlds(four, 0)).toEqual([]);
    expect(postcardWorlds(four, 4)).toEqual(all);
  });
});

// 7d3's review: a postcard's specks, its worlds too small for a body, stand at their own orbits in its plane while its bodies are widened;
// one that would stand on a body's ground, or against it, is not drawn. A system turns as one, so what stands clear at rest stays clear.
describe("a postcard's specks", () => {
  const CLEAR = 0.5;
  const placed = (system: StarSystem, world: Orbiter) => {
    const out = { x: NaN, y: NaN, z: NaN };
    orbitPlace({ system, world }, 0, out);
    return out;
  };

  it("leaves out each speck that would stand within half a unit of a body's ground, and only those", () => {
    const crowds = systemsOf(
      ["a", "b", "c", "d", "e"].flatMap((namespace, at) =>
        Array.from({ length: 12 + at * 40 }, (_, world) => ({
          id: `${namespace}/w${String(world)}`,
          namespace,
          use: (world * 7) % 11,
        })),
      ),
    );
    let hidden = 0;
    for (const system of crowds.filter(({ worlds }) => worlds.length > 0)) {
      const { system: drawn, worlds, hidden: left } = postcardOf(system, { x: 0, y: 60, z: 0 });
      const bodies = new Set(worlds.map(({ id }) => id));
      for (const speck of system.worlds.filter(({ id }) => !bodies.has(id))) {
        const near = worlds.some(
          (body) =>
            Math.hypot(
              ...(["x", "y", "z"] as const).map((axis) => placed(drawn, speck)[axis] - placed(drawn, body)[axis]),
            ) -
              body.radius <
            CLEAR,
        );
        expect(left.has(speck.id)).toBe(near);
        if (near) hidden += 1;
      }
    }
    expect(hidden).toBeGreaterThan(0);
    expect(GRAIN).toBeGreaterThan(0);
  });
});

describe("a postcard's plane", () => {
  const openness = ({ tilt, node }: StarSystem, eye: { x: number; y: number; z: number }) => {
    const normal = [-Math.sin(node) * Math.sin(tilt), Math.cos(tilt), Math.cos(node) * Math.sin(tilt)];
    const length = Math.hypot(eye.x, eye.y, eye.z);
    return Math.abs((normal[0] ?? 0) * eye.x + (normal[1] ?? 0) * eye.y + (normal[2] ?? 0) * eye.z) / length;
  };

  it("opens a plane seen near its edge to half open towards the eye, at display only", () => {
    const flat = systemOf([[0.5, 1.5, 0]]);
    const eye = { x: 0, y: 2, z: 40 };
    const { system } = postcardOf(flat, eye);
    expect(openness(system, eye)).toBeCloseTo(0.5, 9);
    expect(flat.tilt).toBe(0);
  });

  it("leaves a plane seen open enough as it is", () => {
    const open = systemOf([[0.5, 1.5, 0]], 0.3, 1.1);
    const eye = { x: 0, y: 40, z: 5 };
    expect(postcardFrom(open, [], eye).system).toBe(open);
  });

  it("opens a plane leaning away the nearer way, its normal kept upward", () => {
    const leaning = systemOf([[0.5, 1.5, 0]], 2.9, 0.4);
    const eye = { x: 3, y: 1, z: -40 };
    const { system } = postcardOf(leaning, eye);
    expect(openness(system, eye)).toBeCloseTo(0.5, 9);
    expect(system.tilt).toBeLessThanOrEqual(Math.PI / 2);
  });
});
