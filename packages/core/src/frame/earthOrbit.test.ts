import { describe, expect, it } from "vitest";
import { EARTH_PLACE, EARTH_RADIUS, GRAIN } from "../cosmos/system.ts";
import { earthLinksOf, earthSystemOf } from "./earthOrbit.ts";

// What turns round the Earth (7v; Alexis, 2026-11-03): the Earth is no namespace; round it turn the projects the team adds by hand, even with
// no realm (gnosh.ai), as small bodies past its golden ring, whose Moon the globe draws; and its Plan, the Earth from above, each on its orbit
// with its name under it.
const ONE = [{ name: "gnosh.ai", url: "https://gnosh.ai" }];
const SIX = ["gnosh.ai", "atlas", "harbor", "beacon", "forge", "loom"].map((name) => ({
  name,
  url: `https://${name}.example`,
}));
const many = (count: number) =>
  Array.from({ length: count }, (_, at) => ({ name: `p${String(at)}`, url: "https://p.example" }));
// A project's id is no namespace's: a tilde stands in no realm path, so a chain's namespace `earth` keeps its own worlds.
const idOf = (name: string) => `~earth/${name}`;

describe("what turns round the Earth", () => {
  // The golden ring, the Moon's orbit, stands 1.14 Earth radii out (scene/earth/orbit.ts): a project past 1.8 never meets it.
  // Held still, as a system's dynamic view holds its worlds: turning, gnosh.ai made a row with two of Onyx's bodies (deep.ts, projectsOf).
  it("stands each hand-made project by the Earth as a small body of its own, still, past the golden ring, in the disc's plane", () => {
    for (const projects of [ONE, SIX]) {
      const earth = earthSystemOf(projects);
      expect(earth.place).toEqual(EARTH_PLACE);
      expect(earth.tilt).toBe(0);
      expect(earth.worlds.map(({ id }) => id)).toEqual(projects.map(({ name }) => idOf(name)));
      for (const { orbit, radius } of earth.worlds) {
        expect(orbit).toBeGreaterThanOrEqual(1.8 * EARTH_RADIUS);
        expect(orbit).toBeLessThanOrEqual(3.5 * EARTH_RADIUS);
        expect(radius).toBeGreaterThanOrEqual(GRAIN);
        expect(radius).toBeLessThanOrEqual(EARTH_RADIUS / 3);
      }
      expect(earth.spin).toBe(0);
    }
  });

  it("turns the file's first twelve projects, however many it holds", () => {
    expect(earthSystemOf(many(40)).worlds.map(({ id }) => id)).toEqual(many(12).map(({ name }) => idOf(name)));
    expect(earthSystemOf(many(1000)).worlds).toHaveLength(12);
  });

  it("links each project to its own address, or to its world's page where the file names one", () => {
    const links = earthLinksOf([...ONE, { name: "Bubble", url: "https://bubble.example", slug: "bubble" }]);
    expect([...links]).toEqual([
      [idOf("gnosh.ai"), "https://gnosh.ai"],
      [idOf("Bubble"), "/w/bubble"],
    ]);
  });

  it("gives a project the same place in any file, and two projects places of their own", () => {
    const [first] = earthSystemOf(ONE).worlds;
    expect(earthSystemOf([...SIX.slice(1), ...ONE]).worlds.find(({ id }) => id === first?.id)).toEqual(first);
    const places = earthSystemOf(SIX).worlds.map(({ orbit, phase }) => `${orbit.toFixed(2)} ${phase.toFixed(2)}`);
    expect(new Set(places).size).toBe(SIX.length);
  });

  // Its light is the great star's, the map's origin, not its own place: the Earth is no star (7v's review).
  it("lights each project from the great star", () => {
    expect(earthSystemOf(ONE).litBy).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("holds no project when the file holds none", () => {
    expect(earthSystemOf([]).worlds).toEqual([]);
  });
});
