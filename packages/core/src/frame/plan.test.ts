import { describe, expect, it } from "vitest";
import recorded from "../../../../app/lab/worlds.json" with { type: "json" };
import {
  EARTH_PLACE,
  EARTH_RADIUS,
  GRAIN,
  systemsOf,
  type Orbiter,
  type StarSystem,
  type WorldHeld,
} from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { normalOf } from "./depth.ts";
import { orbitPlace } from "./disc.ts";
import { arrivalOf, type Arrival } from "./arrival.ts";
import { earthPlanOf, planOf, plannedOf } from "./plan.ts";
import { cameraTowards, DEGREE, dot, Look, minus, placeOf, REST_SCREENS, STAR_HEART } from "./restLook.ts";

// A system's Plan (7v; Alexis, 2026-11-03, the mock-up he approved at 14:09): seen from above, the only view that draws its orbits, as
// ellipses; its star at the centre, each world on its orbit with its name under it, to pick a world more simply. These read it through
// the view's own projection, on the screens it is composed for.

// Namespaces of one to nine worlds, their uses spread; a crowd, mostly grain; and the recorded Onyx file.
const mixed = (systems: number): WorldHeld[] =>
  Array.from({ length: systems }, (_, system) =>
    Array.from({ length: 1 + ((system * 7) % 9) }, (__, world) => ({
      id: `n${String(system)}/w${String(world)}`,
      namespace: `n${String(system)}`,
      use: 1 + ((system * 31 + world * 17) % 9) * 45,
    })),
  ).flat();
const crowd = (namespace: string, count: number): WorldHeld[] =>
  Array.from({ length: count }, (_, at) => ({ id: `${namespace}/w${String(at)}`, namespace, use: at % 9 }));
const onyx = () =>
  systemsOf(
    (recorded as { worlds: { id: string; namespace: string }[] }).worlds.map(({ id, namespace }) => ({
      id,
      namespace,
      use: 1,
    })),
  );
const SETS = {
  "60 mixed systems": () => systemsOf(mixed(60)),
  "a crowd of 172": () => systemsOf([...mixed(4), ...crowd("busy", 172)]),
  "the recorded Onyx file": onyx,
} as const;
type SetName = keyof typeof SETS;
const bodied = (name: SetName) => SETS[name]().filter(({ worlds }) => worlds.some(({ radius }) => radius >= GRAIN));

// The Plan's worlds as each screen sees them, its star, and the Look.
const seenOn = (system: StarSystem) => {
  const plan = planOf(system);
  return REST_SCREENS.map((screen) => {
    const look = new Look(cameraTowards(plan.eye, plan.look, plan.up), screen, plan.lens);
    const { system: plane, worlds } = plan.postcard;
    return {
      look,
      star: look.seen(system.place),
      worlds: worlds.map((world) => ({ id: world.id, seen: look.seen(placeOf(plane, world, 0), world.radius) })),
    };
  });
};
// A name's room under its world, as the Plan stands it: 30 pixels high, 120 wide at the least.
const NAME = { high: 30, half: 60 };

describe("a system's Plan", () => {
  it.each(Object.keys(SETS) as SetName[])(
    "centres each star of %s on both screens, its plane seen 30 degrees over",
    (name) => {
      for (const system of bodied(name)) {
        const plan = planOf(system);
        expect(plan.look).toEqual(system.place);
        for (const { star, look } of seenOn(system)) {
          expect(star.x).toBeCloseTo(look.width / 2, 6);
          expect(star.y).toBeCloseTo(look.height / 2, 6);
        }
        const way = minus(plan.eye, system.place);
        const over = dot(way, normalOf(system)) / Math.hypot(way.x, way.y, way.z);
        expect(Math.asin(over) / DEGREE).toBeCloseTo(30, 6);
      }
    },
  );

  // The twelve largest by their own size, computed here: every other body no larger than the least of them.
  it.each(Object.keys(SETS) as SetName[])(
    "draws %s's twelve largest worlds of a body's size, on orbits of their own in their real order",
    (name) => {
      for (const system of bodied(name)) {
        const { postcard } = planOf(system);
        const bodies = system.worlds.filter(({ radius }) => radius >= GRAIN);
        const largest = [...bodies].sort((a, b) => b.radius - a.radius).slice(0, 12);
        expect(postcard.worlds.map(({ id }) => id).sort()).toEqual(largest.map(({ id }) => id).sort());
        const least = Math.min(...largest.map(({ radius }) => radius));
        const drawn = new Set(largest.map(({ id }) => id));
        for (const other of bodies) if (!drawn.has(other.id)) expect(other.radius).toBeLessThanOrEqual(least);
        const real = new Map(system.worlds.map((world) => [world.id, world]));
        postcard.worlds.forEach((world, at) => {
          const before = postcard.worlds[at - 1];
          expect(world.phase).toBe(real.get(world.id)?.phase);
          if (before === undefined) return;
          expect(world.orbit).toBeGreaterThan(before.orbit);
          expect(real.get(world.id)?.orbit ?? NaN).toBeGreaterThanOrEqual(real.get(before.id)?.orbit ?? NaN);
        });
      }
    },
  );

  // A crowd is mostly grain (three clear bodies of 172): Onyx's g1ut6uspuh holds 21 worlds of a body's size.
  it("draws exactly twelve of a system with more", () => {
    const many = bodied("the recorded Onyx file").filter(
      ({ worlds }) => worlds.filter(({ radius }) => radius >= GRAIN).length > 12,
    );
    expect(many.length).toBeGreaterThan(0);
    for (const system of many) expect(planOf(system).postcard.worlds).toHaveLength(12);
  });

  it.each(Object.keys(SETS) as SetName[])(
    "draws %s's larger worlds the larger, each by its own size, and hides every world it does not draw",
    (name) => {
      for (const system of bodied(name)) {
        const { postcard } = planOf(system);
        const real = new Map(system.worlds.map((world) => [world.id, world.radius]));
        const scale = (postcard.worlds[0]?.radius ?? NaN) / (real.get(postcard.worlds[0]?.id ?? "") ?? NaN);
        for (const world of postcard.worlds) expect(world.radius).toBeCloseTo((real.get(world.id) ?? NaN) * scale, 9);
        const drawn = new Set(postcard.worlds.map(({ id }) => id));
        expect([...postcard.hidden].sort()).toEqual(
          system.worlds
            .filter(({ id }) => !drawn.has(id))
            .map(({ id }) => id)
            .sort(),
        );
      }
    },
  );

  it.each(Object.keys(SETS) as SetName[])("holds %s's worlds still: a map to pick from", (name) => {
    for (const system of bodied(name)) expect(planOf(system).postcard.system.spin).toBe(0);
  });

  // What makes it a map to click on (the mock-up's words): everything fits the screen, nothing hides behind the sun, each world has its name
  // under it.
  it.each(Object.keys(SETS) as SetName[])(
    "stands each world of %s whole with its name's room under it, off the star's heart, none meeting another or a name",
    (name) => {
      for (const system of bodied(name))
        for (const { look, star, worlds } of seenOn(system)) {
          const boxes = worlds.map(({ seen }) => ({
            left: seen.x - Math.max(seen.radius, NAME.half),
            right: seen.x + Math.max(seen.radius, NAME.half),
            top: seen.y - seen.radius,
            bottom: seen.y + seen.radius + NAME.high,
          }));
          for (const { seen } of worlds)
            expect(Math.hypot(seen.x - star.x, seen.y - star.y) - seen.radius).toBeGreaterThanOrEqual(STAR_HEART);
          for (const box of boxes) {
            expect(box.left).toBeGreaterThanOrEqual(0);
            expect(box.right).toBeLessThanOrEqual(look.width);
            expect(box.top).toBeGreaterThanOrEqual(0.09 * look.height);
            expect(box.bottom).toBeLessThanOrEqual(look.height);
          }
          boxes.forEach((box, at) => {
            for (const other of boxes.slice(at + 1))
              expect(
                box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom,
              ).toBe(false);
          });
        }
    },
  );

  // The mock-up's worlds stand 22 to 92 pixels in radius at 1,728 by 1,080: the most used of a Plan of six or fewer are 30 or more.
  it("draws the largest world of a Plan of six or fewer 30 pixels in radius or more, on Onyx", () => {
    const small = bodied("the recorded Onyx file").filter(
      ({ worlds }) => worlds.filter(({ radius }) => radius >= GRAIN).length <= 6,
    );
    expect(small.length).toBeGreaterThan(20);
    for (const system of small) {
      const [{ worlds }] = seenOn(system) as [ReturnType<typeof seenOn>[number]];
      expect(Math.max(...worlds.map(({ seen }) => seen.radius))).toBeGreaterThanOrEqual(30);
    }
  });

  it("gives a system the same Plan each time", () => {
    for (const system of bodied("60 mixed systems")) expect(planOf({ ...system })).toEqual(planOf(system));
  });

  it("turns from one address to the next: of forty systems alike but for their names, many are seen from their own side", () => {
    const [template] = bodied("60 mixed systems").filter(({ worlds }) => worlds.length === 4);
    if (template === undefined) throw new Error("no system of four");
    const ways = Array.from({ length: 40 }, (_, at) => {
      const { eye } = planOf({ ...template, id: `twin${String(at)}` });
      return Math.round(Math.atan2(eye.x - template.place.x, eye.z - template.place.z) / (15 * DEGREE));
    });
    expect(new Set(ways).size).toBeGreaterThanOrEqual(10);
  });
});

// The Earth's Plan (7v; Alexis, 2026-11-03): the Earth from above, each project the team adds by hand on its orbit with its name under it.
const ONE = [{ name: "gnosh.ai", url: "https://gnosh.ai" }];
const SIX = ["gnosh.ai", "atlas", "harbor", "beacon", "forge", "loom"].map((name) => ({
  name,
  url: `https://${name}.example`,
}));
const many = (count: number) =>
  Array.from({ length: count }, (_, at) => ({ name: `p${String(at)}`, url: "https://p.example" }));
const idOf = (name: string) => `~earth/${name}`;

it("draws the Earth alone when the file holds no project", () => {
  const plan = earthPlanOf([]);
  expect(plan.postcard.worlds).toEqual([]);
  expect(plan.look).toEqual(EARTH_PLACE);
});

describe("the Earth's Plan", () => {
  it.each([
    ["one project", ONE],
    ["six", SIX],
    ["the first twelve of forty", many(40)],
  ])(
    "centres the Earth with %s round it, seen 30 degrees over the disc, each whole with its name's room, off the Earth",
    (_name, projects) => {
      const plan = earthPlanOf(projects);
      expect(plan.look).toEqual(EARTH_PLACE);
      expect(plan.postcard.worlds.map(({ id }) => id)).toEqual(projects.slice(0, 12).map(({ name }) => idOf(name)));
      expect(plan.postcard.system.spin).toBe(0);
      const way = minus(plan.eye, EARTH_PLACE);
      expect(
        Math.asin(dot(way, normalOf(plan.postcard.system)) / Math.hypot(way.x, way.y, way.z)) / DEGREE,
      ).toBeCloseTo(30, 6);
      for (const screen of REST_SCREENS) {
        const look = new Look(cameraTowards(plan.eye, plan.look, plan.up), screen, plan.lens);
        const earth = look.seen(EARTH_PLACE, EARTH_RADIUS);
        expect(earth.x).toBeCloseTo(screen.width / 2, 6);
        expect(earth.radius).toBeGreaterThanOrEqual(60);
        expect(earth.radius).toBeLessThanOrEqual(110);
        const spots = plan.postcard.worlds.map((world) =>
          look.seen(placeOf(plan.postcard.system, world, 0), world.radius),
        );
        for (const spot of spots) {
          expect(Math.hypot(spot.x - earth.x, spot.y - earth.y)).toBeGreaterThanOrEqual(
            earth.radius + spot.radius + 30,
          );
          expect(spot.left).toBeGreaterThanOrEqual(60);
          expect(spot.right).toBeLessThanOrEqual(screen.width - 60);
          expect(spot.top).toBeGreaterThanOrEqual(0.09 * screen.height);
          expect(spot.bottom + 30).toBeLessThanOrEqual(screen.height);
          expect(spot.radius).toBeGreaterThanOrEqual(10);
        }
        spots.forEach((one, at) => {
          for (const other of spots.slice(at + 1))
            expect(Math.hypot(one.x - other.x, one.y - other.y)).toBeGreaterThanOrEqual(one.radius + other.radius + 30);
        });
      }
    },
  );
});

// 7v's design review (F4470; the chief: 7 degrees, for Alexis's "une vue à plat"): at the home's 42.5 degree lens perspective put a Plan's
// outer ellipse's centre 122 px under its star, and its system's own tilt rolled it 13 degrees. A Plan is seen through a lens of its own,
// its plane level, each orbit round its star; a system's dynamic view keeps the home's.
describe("a Plan's own lens", () => {
  const SCREENS = [
    { width: 1728, height: 1080 },
    { width: 1280, height: 800 },
  ] as const;
  // The outer orbit's ring on `screen`, from the Plan's eye through its own lens: its star, its box's centre, and its long axis's angle off
  // the screen's across, from its points' spread, which a level plane seen square holds at none, whatever the points' step.
  const outerOn = (plan: Arrival, screen: (typeof SCREENS)[number]) => {
    const look = new Look(cameraTowards(plan.eye, plan.look, plan.up), screen, plan.lens);
    const { rings } = plannedOf(plan.postcard, { names: new Map(), links: new Map() });
    const spots = (rings.at(-1) ?? []).map(({ x, y, z }) =>
      look.seen({ x: plan.look.x + x, y: plan.look.y + y, z: plan.look.z + z }),
    );
    const [xs, ys] = [spots.map(({ x }) => x), spots.map(({ y }) => y)];
    const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const [mx, my] = [mean(xs), mean(ys)];
    const [xx, yy, xy] = [
      mean(xs.map((x) => (x - mx) ** 2)),
      mean(ys.map((y) => (y - my) ** 2)),
      mean(xs.map((x, at) => (x - mx) * ((ys[at] ?? NaN) - my))),
    ];
    return {
      star: look.seen(plan.look),
      centre: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 },
      roll: Math.atan2(2 * xy, xx - yy) / 2 / DEGREE,
    };
  };
  const round = (plan: Arrival) => {
    expect(plan.lens).toBe(7);
    for (const screen of SCREENS) {
      const { star, centre, roll } = outerOn(plan, screen);
      expect(Math.hypot(centre.x - star.x, centre.y - star.y)).toBeLessThan(20);
      expect(Math.abs(roll)).toBeLessThan(1);
    }
  };

  it.each(Object.keys(SETS) as SetName[])(
    "sits each outer orbit of %s round its star within 20 px, its plane level, through 7 degrees, at 1,728 and 1,280",
    (name) => {
      for (const system of bodied(name)) round(planOf(system));
    },
  );

  it.each([
    ["one project", ONE],
    ["the first twelve of forty", many(40)],
  ])("sits the Earth's outer orbit round it within 20 px, with %s", (_name, projects) => {
    round(earthPlanOf(projects));
  });

  it("leaves a system's dynamic view the home's lens and the map's up", () => {
    const systems = onyx();
    for (const system of bodied("the recorded Onyx file").slice(0, 6)) {
      const arrival = arrivalOf(system, systems);
      expect([arrival.lens, arrival.up]).toEqual([undefined, undefined]);
    }
  });
});

// What a Plan draws besides its worlds (7v): each world's place, held still, and its orbit as a ring round the star, on the map, so the
// chunk that draws them reads no rule of the disc and the cosmos's chunk keeps its own.
describe("a Plan as drawn", () => {
  const system: StarSystem = {
    id: "gnoswap",
    place: { x: 40, y: -2, z: 60 },
    star: 2,
    warmth: 0.5,
    spin: 0.3,
    tilt: 0.4,
    node: 1.1,
    belt: false,
    worlds: [],
  };
  const worlds: Orbiter[] = [
    { id: "gnoswap/router", radius: 0.3, orbit: 1.2, phase: 0.4 },
    { id: "gnoswap/pool", radius: 0.4, orbit: 2.4, phase: 2.9 },
  ];
  const words = {
    names: new Map([["gnoswap/router", "router"]]),
    links: new Map([["gnoswap/pool", "/r/gnoswap/v1/pool"]]),
  };
  const size = ({ x, y, z }: Point) => Math.hypot(x, y, z);

  it("keeps its system, worlds and words as given", () => {
    const plan = plannedOf({ system, worlds }, words);
    expect(plan.system).toBe(system);
    expect(plan.worlds).toBe(worlds);
    expect(plan.names).toBe(words.names);
    expect(plan.links).toBe(words.links);
  });

  it("stands each world where its orbit puts it at rest, its turn's start, still", () => {
    const plan = plannedOf({ system, worlds }, words);
    expect(plan.places).toHaveLength(worlds.length);
    worlds.forEach((world, at) => {
      const out = { x: NaN, y: NaN, z: NaN };
      orbitPlace({ system, world }, 0, out);
      expect(plan.places[at]).toEqual(out);
      expect(size(minus(plan.places[at] ?? system.place, system.place))).toBeCloseTo(world.orbit, 9);
    });
  });

  it("draws each orbit as a ring of 96 points round the star, in the system's plane, through its world", () => {
    const plan = plannedOf({ system, worlds }, words);
    const normal = normalOf(system);
    expect(plan.rings).toHaveLength(worlds.length);
    worlds.forEach((world, at) => {
      const ring = plan.rings[at] ?? [];
      expect(ring).toHaveLength(96);
      for (const point of ring) {
        expect(size(point)).toBeCloseTo(world.orbit, 9);
        expect(point.x * normal.x + point.y * normal.y + point.z * normal.z).toBeCloseTo(0, 9);
      }
      // A step apart all round: the world stands on its ring, within half a step of a point.
      const step = (2 * Math.PI * world.orbit) / 96;
      const from = minus(plan.places[at] ?? system.place, system.place);
      expect(Math.min(...ring.map((point) => size(minus(point, from))))).toBeLessThanOrEqual(step / 2 + 1e-9);
      ring.forEach((point, index) => {
        expect(size(minus(point, ring[(index + 1) % ring.length] ?? point))).toBeCloseTo(
          2 * world.orbit * Math.sin(Math.PI / 96),
          9,
        );
      });
    });
  });

  it("draws nothing for a Plan of no world", () => {
    expect(plannedOf({ system, worlds: [] }, words)).toMatchObject({ places: [], rings: [] });
  });
});
