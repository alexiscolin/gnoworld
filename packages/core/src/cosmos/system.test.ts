import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HOME } from "../space/drift.ts";
import { CELL, placeSystems, starSize } from "./cosmos.ts";
import {
  BELT_INNER,
  CENTRE,
  DISC_TILT,
  EARTH_PLACE,
  EARTH_RADIUS,
  GNO_LAND,
  GRAIN,
  orbitPlace,
  ROOM,
  systemsOf,
  toMap,
  toScene,
  WORLD_MOST,
  type Orbiter,
  type StarSystem,
  type WorldHeld,
} from "./system.ts";

// A namespace's worlds around its star (ADR-0002 §3 and §10): the same file gives the same systems on every device, each stays in the room
// its cell leaves it, and a namespace of hundreds keeps its worlds apart, with the same cell as one of one (F3563).
const held = (namespace: string, count: number, use = 1): WorldHeld[] =>
  Array.from({ length: count }, (_, at) => ({ id: `${namespace}/w${String(at)}`, namespace, use }));
const named = (systems: readonly StarSystem[], id: string) => {
  const found = systems.find((system) => system.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
};
const centreOf = (systems: readonly StarSystem[]) => named(systems, GNO_LAND);
const between = (a: Orbiter, b: Orbiter) =>
  Math.hypot(
    a.orbit * Math.cos(a.phase) - b.orbit * Math.cos(b.phase),
    a.orbit * Math.sin(a.phase) - b.orbit * Math.sin(b.phase),
  );
const gapOf = (a: Orbiter, b: Orbiter) => between(a, b) - a.radius - b.radius;
const mixedUse = (namespace: string, count: number): WorldHeld[] =>
  held(namespace, count).map((world, at) => ({ ...world, use: at % 7 === 0 ? 4000 : at % 3 }));

describe("systemsOf", () => {
  it("makes one star a namespace, and gno.land's at the centre, whatever the file holds", () => {
    const systems = systemsOf([...held("a", 2), ...held("b", 1)]);
    expect(systems.map(({ id }) => id).sort()).toEqual(["a", "b", GNO_LAND].sort());
    expect(centreOf(systems).place).toEqual({ x: 0, y: 0, z: 0 });
    expect(centreOf(systemsOf([])).worlds).toEqual([]);
  });

  it("gives the centre the largest star and no generated world: the Earth is hand-made", () => {
    const systems = systemsOf(held("a", 900));
    expect(centreOf(systems).star).toBe(starSize(1024));
    expect(centreOf(systems).worlds).toHaveLength(0);
  });

  it("gives the same file the same systems, in any order", () => {
    const file = [...held("a", 7), ...held("b", 3), ...held("c", 1)];
    const sorted = (systems: StarSystem[]) => systems.sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(sorted(systemsOf([...file].reverse()))).toEqual(sorted(systemsOf(file)));
  });

  it("places a system where the map does, and sizes its star by what it holds", () => {
    const file = [...held("a", 8), ...held("b", 1)];
    const places = placeSystems([{ id: "a" }, { id: "b" }]);
    const systems = systemsOf(file);
    expect(named(systems, "a").place).toEqual(places.get("a"));
    expect(named(systems, "a").star).toBe(starSize(8));
    expect(named(systems, "b").star).toBe(starSize(1));
  });

  it("puts the most used world first: the system's landmark", () => {
    const worlds = [...held("a", 4), { id: "a/big", namespace: "a", use: 200 }];
    expect(named(systemsOf(worlds), "a").worlds[0]?.id).toBe("a/big");
  });

  it("sizes a world by its use on a log ladder, capped, with a whole world for one of no use", () => {
    const radius = (use: number) =>
      named(systemsOf([{ id: "a/x", namespace: "a", use }]), "a").worlds[0]?.radius ?? NaN;
    expect(radius(0)).toBeGreaterThan(0.5);
    expect(radius(0)).toBe(radius(1));
    expect(radius(40)).toBeGreaterThan(radius(1));
    expect(radius(1_000_000)).toBe(radius(1 << 30));
    expect(radius(1 << 30)).toBeLessThanOrEqual(WORLD_MOST);
  });

  it("keeps every world inside the belt's edge, the belt inside the room its cell leaves, so two systems never touch", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1500 }), fc.integer({ min: 0, max: 5000 }), (count, use) => {
        for (const { orbit, radius } of named(systemsOf(held("a", count, use)), "a").worlds)
          expect(orbit + radius).toBeLessThanOrEqual(BELT_INNER);
      }),
      { numRuns: 30 },
    );
    expect(BELT_INNER).toBeLessThan(ROOM);
    expect(2 * ROOM).toBeLessThanOrEqual(CELL);
  });

  it("keeps every body apart at any size, every pair and any mix of use: no pile-up in a cell of 500", () => {
    for (const count of [2, 3, 5, 12, 60, 172, 226, 500, 2000]) {
      const all = named(systemsOf(mixedUse("a", count)), "a").worlds;
      expect(all).toHaveLength(count);
      const worlds = all.filter(({ radius }) => radius >= GRAIN);
      expect(worlds.length).toBeGreaterThan(0);
      const least = worlds.reduce(
        (close, one, at) =>
          worlds.reduce((nearest, other, next) => (next <= at ? nearest : Math.min(nearest, gapOf(one, other))), close),
        Number.POSITIVE_INFINITY,
      );
      expect(least).toBeGreaterThan(0);
    }
  });

  it("shows a dense system by a few clear bodies: its three most used keep a world's size, the rest are grain", () => {
    const { worlds } = named(systemsOf(mixedUse("a", 127)), "a");
    for (const clear of worlds.slice(0, 3)) expect(clear.radius).toBeGreaterThan(0.6);
    for (const grain of worlds.slice(3)) expect(grain.radius).toBeLessThan(GRAIN);
  });

  it("scatters a crowd's grain in loose clumps, never in the lattice's printed rows", () => {
    const { worlds } = named(systemsOf(mixedUse("a", 172)), "a");
    const grain = worlds.slice(3);
    const turn = 2 * Math.PI;
    const place = (world: Orbiter) => ((world.phase % turn) + turn) % turn;
    const sectors = new Array<number>(24).fill(0);
    for (const world of grain) {
      const sector = Math.floor((place(world) / turn) * 24);
      sectors[sector] = (sectors[sector] ?? 0) + 1;
    }
    const mean = grain.length / 24;
    const spread = Math.sqrt(sectors.reduce((sum, count) => sum + (count - mean) ** 2, 0) / 24);
    expect(spread / mean).toBeGreaterThan(0.4);
    const orbits = new Set(grain.map(({ orbit }) => orbit.toFixed(3)));
    expect(orbits.size).toBeGreaterThan(grain.length * 0.8);
  });

  it("scatters a crowd the same way each time: the same file, the same dust", () => {
    expect(named(systemsOf(mixedUse("a", 172)), "a").worlds).toEqual(named(systemsOf(mixedUse("a", 172)), "a").worlds);
  });

  it("keeps a small system's worlds all at a world's size", () => {
    for (const { radius } of named(systemsOf(held("a", 5)), "a").worlds) expect(radius).toBeGreaterThan(0.5);
  });

  it.each([1, 3, 12, 60, 127, 500])(
    "moves nothing with activity, %i worlds: other uses, the same place for each (ADR-0002 §3)",
    (count) => {
      const places = (uses: (at: number) => number) => {
        const file = held("a", count).map((world, at) => ({ ...world, use: uses(at) }));
        const { worlds } = named(systemsOf(file), "a");
        return new Map(worlds.map(({ id, orbit, phase }) => [id, { orbit, phase }]));
      };
      const quiet = places(() => 0);
      expect(places((at) => (count - at) * 37)).toEqual(quiet);
      expect(places((at) => (at % 5 === 0 ? 900 : 1))).toEqual(quiet);
      expect(places((at) => at * at)).toEqual(quiet);
    },
  );

  it("lets activity change a size: the most used of a crowd stands clear", () => {
    const uses = (busy: number) => held("a", 127).map((world, at) => ({ ...world, use: at === busy ? 900 : 1 }));
    const radiusOf = (busy: number, at: number) =>
      named(systemsOf(uses(busy)), "a").worlds.find(({ id }) => id === `a/w${String(at)}`)?.radius ?? NaN;
    expect(radiusOf(40, 40)).toBeGreaterThan(GRAIN);
    expect(radiusOf(41, 40)).toBeLessThan(GRAIN);
  });

  it("counts a world named twice once", () => {
    expect(named(systemsOf([...held("a", 3), ...held("a", 3)]), "a").worlds).toHaveLength(3);
  });

  it("tells gno.land's star from a namespace named gnoland: a slug holds no dot", () => {
    const systems = systemsOf(held("gnoland", 4));
    expect(systems).toHaveLength(2);
    expect(named(systems, "gnoland").worlds).toHaveLength(4);
    expect(GNO_LAND).toContain(".");
  });

  it("keeps a world where it is when a neighbour arrives, unless the two meet or the cell's ladder doubles", () => {
    const before = named(systemsOf(held("a", 100)), "a").worlds;
    const after = named(systemsOf(held("a", 101)), "a").worlds;
    const stayed = before.filter((world) => after.some((next) => next.id === world.id && next.phase === world.phase));
    expect(stayed.length).toBeGreaterThanOrEqual(98);
  });

  it("gives a share of the systems a far belt, by their name alone", () => {
    const systems = systemsOf(Array.from({ length: 600 }, (_, at) => held(`n${String(at)}`, 1)).flat());
    const belted = systems.filter(({ belt }) => belt).length / systems.length;
    expect(belted).toBeGreaterThan(0.2);
    expect(belted).toBeLessThan(0.5);
  });

  it("gives each star its own warmth and pace, in a real star's range", () => {
    const systems = systemsOf(Array.from({ length: 300 }, (_, at) => held(`n${String(at)}`, 1)).flat());
    for (const { warmth, spin } of systems) {
      expect(warmth).toBeGreaterThanOrEqual(0);
      expect(warmth).toBeLessThanOrEqual(1);
      expect(Math.abs(spin)).toBeGreaterThan(0.03);
      expect(Math.abs(spin)).toBeLessThan(0.2);
    }
    expect(new Set(systems.map(({ warmth }) => warmth)).size).toBeGreaterThan(250);
  });
});

describe("the tilt's numbers", () => {
  it("are the tilt's own cosine and sine: the two are written as numbers", () => {
    const out = { x: NaN, y: NaN, z: NaN };
    toScene({ x: 0, y: 1, z: 0 }, out);
    expect(out.y - CENTRE.y).toBeCloseTo(Math.cos(DISC_TILT), 12);
    expect(out.z - CENTRE.z).toBeCloseTo(Math.sin(DISC_TILT), 12);
    expect(DISC_TILT).toBeCloseTo(Math.PI / 3, 12);
  });
});

describe("orbitPlace", () => {
  const made = () => {
    const system = named(systemsOf(held("a", 6)), "a");
    const world = system.worlds[0] ?? { id: "", radius: 1, orbit: 1, phase: 0 };
    const at = (seconds: number, which = world) => {
      const out = { x: NaN, y: NaN, z: NaN };
      orbitPlace({ system, world: which }, seconds, out);
      return out;
    };
    return { system, world, at };
  };

  it("holds a world on its circle in the disc's plane, around its star", () => {
    const { system, world, at } = made();
    for (const seconds of [0, 7, 90, 12_000]) {
      const { x, y, z } = at(seconds);
      expect(Math.hypot(x - system.place.x, z - system.place.z)).toBeCloseTo(world.orbit, 9);
      expect(y).toBe(system.place.y);
    }
  });

  it("gives a second the same place, turns the whole system together, and starts at its phase", () => {
    const { system, world, at } = made();
    expect(at(40)).toEqual(at(40));
    expect(at(0).x - system.place.x).toBeCloseTo(world.orbit * Math.cos(world.phase), 9);
    expect(at(0).z - system.place.z).toBeCloseTo(world.orbit * Math.sin(world.phase), 9);
    const other = system.worlds[1] ?? world;
    const gap = (seconds: number) => {
      const [a, b] = [at(seconds), at(seconds, other)];
      return Math.hypot(a.x - b.x, a.z - b.z);
    };
    expect(gap(500)).toBeCloseTo(gap(0), 9);
    expect(at(10)).not.toEqual(at(0));
  });
});

describe("the disc on the stage", () => {
  const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
    expect(a.z).toBeCloseTo(b.z, 9);
  };
  const spot = () => ({ x: NaN, y: NaN, z: NaN });

  it("stands its centre ahead of where the eye rests, at the arrival's distance", () => {
    expect(CENTRE.z).toBeLessThan(HOME.z);
    const away = Math.hypot(CENTRE.x - HOME.x, CENTRE.y - HOME.y, CENTRE.z - HOME.z);
    expect(away).toBeGreaterThan(30);
    expect(away).toBeLessThan(70);
  });

  it("takes a place to the stage and back, and keeps every distance", () => {
    const place = { x: 31, y: -2, z: -44 };
    const onStage = spot();
    const back = spot();
    toScene(place, onStage);
    toMap(onStage, back);
    close(back, place);
    expect(Math.hypot(onStage.x - CENTRE.x, onStage.y - CENTRE.y, onStage.z - CENTRE.z)).toBeCloseTo(
      Math.hypot(31, 2, 44),
      9,
    );
  });

  it("lays the map's far side at the top of the view and its near side towards the eye", () => {
    const [far, near] = [spot(), spot()];
    toScene({ x: 0, y: 0, z: -20 }, far);
    toScene({ x: 0, y: 0, z: 20 }, near);
    expect(far.y).toBeGreaterThan(near.y);
    expect(far.z).toBeLessThan(near.z);
  });

  it("sees the disc from well above it: a world on it is lit from the side, never from the eye", () => {
    const eye = spot();
    toMap(HOME, eye);
    const elevation = Math.asin(eye.y / Math.hypot(eye.x, eye.y, eye.z));
    expect(elevation).toBeGreaterThan(Math.PI / 4);
    expect(elevation).toBeLessThan(Math.PI / 2);
  });

  it("stands the Earth, its ring and its Moon clear of the great star and of ring 1's rooms", () => {
    const fromCentre = Math.hypot(EARTH_PLACE.x, EARTH_PLACE.z);
    const nearestRoom = 2 * CELL - 0.45 * CELL - ROOM;
    expect(fromCentre - EARTH_RADIUS * 1.3).toBeGreaterThan(starSize(1024) / 2);
    expect(fromCentre + EARTH_RADIUS * 1.3).toBeLessThanOrEqual(nearestRoom);
  });
});
