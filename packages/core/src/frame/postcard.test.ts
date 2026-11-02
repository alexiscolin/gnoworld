import { describe, expect, it } from "vitest";
import { CELL } from "../cosmos/cosmos.ts";
import type { Orbiter, StarSystem } from "../cosmos/system.ts";
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

  it("draws nothing as a body of grain alone, and four at most", () => {
    expect(postcardWorlds(systemOf([[0.1, 1, 0]]))).toEqual([]);
    const many = systemOf(Array.from({ length: 12 }, (_, at) => [0.3 + at * 0.08, 0.8 + at * 0.1, at * 1.3]));
    expect(postcardWorlds(many).length).toBeLessThanOrEqual(4);
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
