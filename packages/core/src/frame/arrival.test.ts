import { describe, expect, it } from "vitest";
import {
  BELT_INNER,
  EARTH_PLACE,
  EARTH_RADIUS,
  GRAIN,
  ROCKS_FROM,
  ROOM,
  systemsOf,
  type StarSystem,
  type WorldHeld,
} from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { SWAY } from "../space/drift.ts";
import { arrivalOf, type Arrival } from "./arrival.ts";
import { composed } from "./composition.ts";
import { onPlane, orbitPlace } from "./disc.ts";
import { REST_SCREENS, STAR_HEART } from "./rest.ts";
import { away, DEGREE, dot, focalOf, minus, type Seen } from "./restLook.ts";

// A system's arrival (7d3, ADR-0002 §10, "A system is a postcard"): where the eye comes to rest when it comes to a system, and what it looks
// at. These read it through a camera of their own: at the arrival's eye, looking at its look, the map's up kept up, swayed as the scene sways.

// Namespaces of one to six worlds, their uses spread: rich and plain systems, belted or not, near the centre and far out.
function mixed(systems: number, each = (system: number) => 1 + ((system * 7) % 6)): WorldHeld[] {
  return Array.from({ length: systems }, (_, system) =>
    Array.from({ length: each(system) }, (__, world) => ({
      id: `n${String(system)}/w${String(world)}`,
      namespace: `n${String(system)}`,
      use: 1 + ((system * 31 + world * 17) % 9) * 45,
    })),
  ).flat();
}

const crowd = (namespace: string, count: number): WorldHeld[] =>
  Array.from({ length: count }, (_, at) => ({ id: `${namespace}/w${String(at)}`, namespace, use: at % 9 }));

const SETS = {
  "80 mixed systems": () => systemsOf(mixed(80)),
  "crowds and singles": () =>
    systemsOf([...mixed(20), ...crowd("busy", 172), ...crowd("test", 127), ...crowd("mid", 30)]),
} as const;
type SetName = keyof typeof SETS;
// A row names a system by its set and its id: each test builds the set again, so what it asserts is computed while it runs.
const ROWS = (Object.keys(SETS) as SetName[]).flatMap((name) =>
  SETS[name]()
    .filter(({ worlds }) => worlds.length > 0)
    .map(({ id }) => [name, id] as const),
);
function caseOf(name: SetName, id: string) {
  const systems = SETS[name]();
  const system = systems.find((each) => each.id === id);
  if (system === undefined) throw new Error(`no system ${id}`);
  return { system, systems };
}
// Every system that holds a world, each with the set it stands in.
const allCases = () => ROWS.map(([name, id]) => caseOf(name, id));

const unit = (a: Point) => {
  const length = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / length, y: a.y / length, z: a.z / length };
};
const cross = (a: Point, b: Point) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const along = (a: Point, b: Point, by: number) => ({ x: a.x + b.x * by, y: a.y + b.y * by, z: a.z + b.z * by });
const axesOf = (eye: Point, look: Point) => {
  const ahead = unit(minus(look, eye));
  const right = unit(cross(ahead, { x: 0, y: 1, z: 0 }));
  return { ahead, right, up: cross(right, ahead) };
};

// The eye at rest and the four corners of its sway, along the arrival's own axes: what the view must hold with motion on.
const SWAYED: readonly (readonly [number, number])[] = [
  [0, 0],
  [SWAY.across, SWAY.up],
  [SWAY.across, -SWAY.up],
  [-SWAY.across, SWAY.up],
  [-SWAY.across, -SWAY.up],
];

/** A camera at the arrival's eye, swayed `across` and `upward` along its own axes, looking at its look, the map's up kept up, on a screen. */
function cameraOf(
  { eye: rest, look }: Arrival,
  { width, height }: { readonly width: number; readonly height: number },
  [across, upward]: readonly [number, number] = [0, 0],
) {
  const at = axesOf(rest, look);
  const eye = along(along(rest, at.right, across), at.up, upward);
  const { ahead, right, up } = axesOf(eye, look);
  const focal = focalOf(height);
  return (place: Point, size = 0): Seen => {
    const from = minus(place, eye);
    const depth = dot(from, ahead);
    const [x, y, radius] = [
      width / 2 + (focal * dot(from, right)) / depth,
      height / 2 - (focal * dot(from, up)) / depth,
      (focal * size) / Math.max(depth, 1e-9),
    ];
    const box = { left: x - radius, right: x + radius, top: y - radius, bottom: y + radius };
    return { x, y, radius, depth, away: Math.hypot(from.x, from.y, from.z), ...box };
  };
}

// The postcard's worlds where they stand `seconds` on, in its plane as drawn.
const placesOf = ({ postcard: { system, worlds } }: Arrival, seconds: number) =>
  worlds.map((world) => {
    const out = { x: NaN, y: NaN, z: NaN };
    orbitPlace({ system, world }, seconds, out);
    return { at: out, radius: world.radius };
  });
// Eight instants through a turn: the postcard's worlds turn at rest.
const turnOf = ({ postcard: { system } }: Arrival) =>
  Array.from({ length: 8 }, (_, step) => (step * 2 * Math.PI) / 8 / Math.abs(system.spin));
// How far its worlds reach from its star, its far belt with them: what the arrival frames.
const reachOf = ({ postcard: { system, worlds } }: Arrival) =>
  Math.max(system.belt ? ROOM : 0, ...worlds.map(({ orbit, radius }) => orbit + radius));
const normalOf = ({ tilt, node }: StarSystem) => ({
  x: -Math.sin(node) * Math.sin(tilt),
  y: Math.cos(tilt),
  z: Math.cos(node) * Math.sin(tilt),
});
// Where the star stands off the screen's middle: a third of the way in or so.
const SIDE_LEAST = 0.12;
const SIDE_MOST = 0.3;

describe("a system's arrival: the same address, the same postcard", () => {
  it("gives a system the same arrival each time it is asked, in the same set, in any order", () => {
    for (const { system, systems } of allCases()) {
      const arrival = arrivalOf(system, systems);
      expect(arrivalOf(system, systems)).toEqual(arrival);
      expect(arrivalOf(system, [...systems].reverse())).toEqual(arrival);
    }
  });

  it("reads only what stands near: the systems more than 160 units off change nothing", () => {
    for (const { system, systems } of allCases()) {
      const near = systems.filter((other) => away(other.place, system.place) <= 160);
      expect(arrivalOf(system, near)).toEqual(arrivalOf(system, systems));
    }
  });

  it("draws the worlds the view at rest would, each at its own phase and size, four at most", () => {
    for (const { system, systems } of allCases()) {
      const { postcard } = arrivalOf(system, systems);
      expect(postcard.worlds.length).toBeLessThanOrEqual(4);
      if (system.worlds.some(({ radius }) => radius >= GRAIN)) expect(postcard.worlds.length).toBeGreaterThan(0);
      for (const world of postcard.worlds) {
        const own = system.worlds.find(({ id }) => id === world.id);
        expect(world.radius).toBe(own?.radius);
        expect(world.phase).toBe(own?.phase);
      }
    }
  });

  it("gives addresses their own angles: of forty systems alike but for their names, few are seen alike", () => {
    const [template] = SETS["80 mixed systems"]().filter(({ worlds }) => worlds.length === 3);
    if (template === undefined) throw new Error("no system of three");
    const named = Array.from({ length: 40 }, (_, at) => ({ ...template, id: `twin${String(at)}` }));
    const ways = named.map((system) => {
      const way = unit(minus(arrivalOf(system, [system]).eye, system.place));
      return `${way.x.toFixed(1)} ${way.y.toFixed(1)} ${way.z.toFixed(1)}`;
    });
    expect(new Set(ways).size).toBeGreaterThanOrEqual(24);
  });
});

describe("a system's arrival: a good angle", () => {
  // Each world whole under the header through the turn, and the belt's far edge on the screen, seen through `see`.
  const wholeThrough = (
    see: ReturnType<typeof cameraOf>,
    arrival: Arrival,
    { width, height }: (typeof REST_SCREENS)[number],
  ) => {
    for (const seconds of turnOf(arrival))
      for (const { at, radius } of placesOf(arrival, seconds)) {
        const seen = see(at, radius);
        expect(seen.depth).toBeGreaterThan(radius);
        expect(seen.left).toBeGreaterThanOrEqual(0);
        expect(seen.right).toBeLessThanOrEqual(width);
        // Under the header's band, a tenth of the height.
        expect(seen.top).toBeGreaterThanOrEqual(0.09 * height);
        expect(seen.bottom).toBeLessThanOrEqual(height);
      }
    if (!arrival.postcard.system.belt) return;
    for (let step = 0; step < 24; step += 1) {
      const [rim, angle] = [{ x: NaN, y: NaN, z: NaN }, (step * Math.PI) / 12];
      onPlane(arrival.postcard.system, { along: ROOM * Math.cos(angle), across: ROOM * Math.sin(angle), up: 0 }, rim);
      const { x, y } = see(rim);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(height);
    }
  };

  it.each(ROWS)(
    "on %s, frames %s whole on both screens, its far belt with it, through its turn and its sway",
    (name, id) => {
      const { system, systems } = caseOf(name, id);
      const arrival = arrivalOf(system, systems);
      for (const screen of REST_SCREENS)
        for (const swayed of SWAYED) wholeThrough(cameraOf(arrival, screen, swayed), arrival, screen);
    },
  );

  it.each(ROWS)(
    "on %s, stands %s's star a third of the way in or so: never centred for the camera, never at the edge",
    (name, id) => {
      const { system, systems } = caseOf(name, id);
      const arrival = arrivalOf(system, systems);
      for (const screen of REST_SCREENS) {
        const star = cameraOf(arrival, screen)(system.place);
        expect(star.depth).toBeGreaterThan(0);
        expect(Math.abs(star.x - screen.width / 2)).toBeGreaterThanOrEqual(SIDE_LEAST * screen.width);
        expect(Math.abs(star.x - screen.width / 2)).toBeLessThanOrEqual(SIDE_MOST * screen.width);
        expect(Math.abs(star.y - screen.height / 2)).toBeLessThanOrEqual(0.25 * screen.height);
      }
    },
  );

  it.each(ROWS)(
    "on %s, sees %s from above its plane at a slant: never face on, never edge on, never from under it",
    (name, id) => {
      const { system, systems } = caseOf(name, id);
      const arrival = arrivalOf(system, systems);
      const over = dot(unit(minus(arrival.eye, system.place)), normalOf(arrival.postcard.system));
      expect(over).toBeGreaterThanOrEqual(Math.sin(30 * DEGREE) - 1e-9);
      expect(over).toBeLessThanOrEqual(Math.sin(60 * DEGREE) + 1e-9);
    },
  );

  it.each(ROWS)("on %s, never looks at %s straight down or straight up the map", (name, id) => {
    const { system, systems } = caseOf(name, id);
    const arrival = arrivalOf(system, systems);
    expect(Math.abs(unit(minus(arrival.look, arrival.eye)).y)).toBeLessThanOrEqual(Math.sin(60 * DEGREE));
  });

  it.each(ROWS)("on %s, stands near %s for depth: its near side half again as large as its far side", (name, id) => {
    const { system, systems } = caseOf(name, id);
    const arrival = arrivalOf(system, systems);
    const [distance, reach] = [away(arrival.eye, system.place), reachOf(arrival)];
    expect((distance + reach) / (distance - reach)).toBeGreaterThanOrEqual(1.4);
  });

  it.each(ROWS)("on %s, keeps %s's star's heart clear on arrival, through its sway: no world on it", (name, id) => {
    const { system, systems } = caseOf(name, id);
    const arrival = arrivalOf(system, systems);
    for (const screen of REST_SCREENS)
      for (const swayed of SWAYED) {
        const see = cameraOf(arrival, screen, swayed);
        const star = see(system.place);
        for (const { at, radius } of placesOf(arrival, 0)) {
          const seen = see(at, radius);
          expect(Math.hypot(seen.x - star.x, seen.y - star.y) - seen.radius).toBeGreaterThanOrEqual(STAR_HEART);
        }
      }
  });

  // What gives a planetarium away (part-pipeline.md, Alexis 2026-11-02), as 7d6's `composed` reads it: a crowd, one on another, a row. The
  // first picture judges the star with its worlds; through the turn the worlds alone, for a world, its star and another line up as they turn.
  it.each(ROWS)(
    "on %s, reads %s as the view at rest's rules would: its first picture with its star, its worlds alone through its turn",
    (name, id) => {
      const { system, systems } = caseOf(name, id);
      const arrival = arrivalOf(system, systems);
      for (const screen of REST_SCREENS) {
        const see = cameraOf(arrival, screen);
        const star = see(system.place);
        const judged = (seconds: number, lights: readonly Seen[]) => {
          const [first, ...rest] = placesOf(arrival, seconds).map(({ at, radius }) => see(at, radius));
          return first === undefined || composed(rest, first, { deep: false, lights, ...screen });
        };
        expect(judged(0, [star])).toBe(true);
        for (const seconds of turnOf(arrival)) expect(judged(seconds, [])).toBe(true);
      }
    },
  );

  it("keeps the Earth off a postcard where it shows: never on the system, which it would hide or cut", () => {
    const near = allCases().filter(({ system }) => away(system.place, EARTH_PLACE) < 80);
    expect(near.length).toBeGreaterThan(0);
    for (const { system, systems } of near) {
      const arrival = arrivalOf(system, systems);
      for (const screen of REST_SCREENS) {
        const see = cameraOf(arrival, screen);
        const [earth, ball] = [see(EARTH_PLACE, EARTH_RADIUS), see(system.place, reachOf(arrival))];
        if (earth.depth <= 0) continue;
        expect(Math.hypot(earth.x - ball.x, earth.y - ball.y)).toBeGreaterThanOrEqual(earth.radius + ball.radius);
      }
    }
  });

  // A ring of systems a little off the Earth: some first angles would set the Earth on the ball, and another angle is taken.
  it("keeps the Earth off the postcards of systems beside it, whichever angle their names try first", () => {
    const [template] = SETS["80 mixed systems"]().filter(({ worlds }) => worlds.length === 2);
    if (template === undefined) throw new Error("no system of two");
    for (let at = 0; at < 48; at += 1) {
      const around = (at * 2 * Math.PI) / 48;
      const place = {
        x: EARTH_PLACE.x + 22 * Math.cos(around),
        y: 2 * Math.sin(3 * around),
        z: EARTH_PLACE.z + 22 * Math.sin(around),
      };
      const system = { ...template, id: `beside${String(at)}`, place };
      const arrival = arrivalOf(system, [system]);
      for (const screen of REST_SCREENS) {
        const see = cameraOf(arrival, screen);
        const [earth, ball] = [see(EARTH_PLACE, EARTH_RADIUS), see(place, reachOf(arrival))];
        if (earth.depth > 0)
          expect(Math.hypot(earth.x - ball.x, earth.y - ball.y)).toBeGreaterThanOrEqual(earth.radius + ball.radius);
      }
    }
  });

  it("stands the eye outside every other system's room", () => {
    for (const { system, systems } of allCases()) {
      const { eye } = arrivalOf(system, systems);
      for (const other of systems)
        if (other !== system) expect(away(eye, other.place)).toBeGreaterThanOrEqual(ROOM + 1);
    }
  });

  // A star nearer than 60 units keeps a halo of its own (halos.ts: whole to 40, a point by 120): one on the postcard would be a second sun.
  it("puts no other haloed star on the postcard: one light a system", () => {
    for (const { system, systems } of allCases()) {
      const arrival = arrivalOf(system, systems);
      const see = cameraOf(arrival, REST_SCREENS[0]);
      const ball = see(system.place, reachOf(arrival));
      for (const other of systems) {
        const star = see(other.place);
        if (other === system || star.depth <= 0 || star.away > 60) continue;
        expect(Math.hypot(star.x - ball.x, star.y - ball.y)).toBeGreaterThanOrEqual(ball.radius);
      }
    }
  });

  it("varies the angle from one system to the next: from all round the map, its star left and right, at several slants and distances", () => {
    const arrivals = allCases().map(({ system, systems }) => [system, arrivalOf(system, systems)] as const);
    const flat = arrivals.map(([system, { eye }]) => {
      const way = unit(minus(eye, system.place));
      return Math.atan2(way.x, way.z);
    });
    const mean = Math.hypot(
      flat.reduce((sum, angle) => sum + Math.cos(angle), 0),
      flat.reduce((sum, angle) => sum + Math.sin(angle), 0),
    );
    expect(mean / flat.length).toBeLessThanOrEqual(0.35);
    const [screen] = REST_SCREENS;
    const left = arrivals.filter(([system, arrival]) => cameraOf(arrival, screen)(system.place).x < screen.width / 2);
    expect(left.length).toBeGreaterThanOrEqual(0.25 * arrivals.length);
    expect(arrivals.length - left.length).toBeGreaterThanOrEqual(0.25 * arrivals.length);
    const slants = arrivals.map(([system, arrival]) =>
      Math.round(
        Math.asin(dot(unit(minus(arrival.eye, system.place)), normalOf(arrival.postcard.system))) / DEGREE / 5,
      ),
    );
    expect(new Set(slants).size).toBeGreaterThanOrEqual(3);
    const fills = arrivals.map(([system, arrival]) => (reachOf(arrival) / away(arrival.eye, system.place)).toFixed(2));
    expect(new Set(fills).size).toBeGreaterThanOrEqual(3);
  });

  it("shows a system of grain alone by its star, whole and a third of the way in", () => {
    const grain: StarSystem = {
      id: "dust",
      place: { x: 300, y: 4, z: -220 },
      star: 1,
      warmth: 0.3,
      spin: 0.08,
      tilt: 0.4,
      node: 1.2,
      belt: false,
      worlds: [{ id: "dust/w0", radius: GRAIN / 2, orbit: 2, phase: 0.3 }],
    };
    const arrival = arrivalOf(grain, [grain]);
    expect(arrival.postcard.worlds).toEqual([]);
    const [screen] = REST_SCREENS;
    const star = cameraOf(arrival, screen)(grain.place);
    expect(star.depth).toBeGreaterThan(ROOM);
    expect(Math.abs(star.x - screen.width / 2)).toBeGreaterThanOrEqual(SIDE_LEAST * screen.width);
    expect(Math.abs(star.x - screen.width / 2)).toBeLessThanOrEqual(SIDE_MOST * screen.width);
  });

  it("holds in a file of 10,000 worlds: the eye outside every room, four bodies at most, the same in any order", () => {
    const systems = systemsOf(mixed(2500, (system) => 1 + (system % 7)));
    const sample = systems.filter(({ worlds }) => worlds.length > 0).filter((_, at) => at % 125 === 0);
    expect(sample.length).toBeGreaterThanOrEqual(20);
    const reversed = [...systems].reverse();
    for (const system of sample) {
      const arrival = arrivalOf(system, systems);
      expect(arrival.postcard.worlds.length).toBeLessThanOrEqual(4);
      for (const other of systems)
        if (other !== system) expect(away(arrival.eye, other.place)).toBeGreaterThanOrEqual(ROOM + 1);
      expect(arrivalOf(system, reversed)).toEqual(arrival);
    }
  });
});

// Debris is only a far belt, for dust is a sign (ADR-0002 §10): a rock near a world would read as that world crumbling.
describe("a system's arrival: no debris near a planet", () => {
  // Half a unit: about a third of a body's radius, 25 pixels or more at an arrival's distance.
  const CLEAR = 0.5;

  it("lays a far belt's rocks past every world a postcard draws, half a unit or more off its ground, at any turn", () => {
    const belted = allCases().filter(({ system }) => system.belt);
    expect(belted.length).toBeGreaterThan(5);
    for (const { system, systems } of belted)
      for (const { orbit, radius } of arrivalOf(system, systems).postcard.worlds)
        expect(orbit + radius + CLEAR).toBeLessThanOrEqual(ROCKS_FROM + 1e-9);
  });

  it("lays them past every world its system holds, as the ladder draws them anywhere", () => {
    for (const { system } of allCases().filter((each) => each.system.belt))
      for (const { orbit, radius } of system.worlds)
        expect(orbit + radius + CLEAR).toBeLessThanOrEqual(ROCKS_FROM + 1e-9);
    expect(ROCKS_FROM - BELT_INNER).toBeGreaterThanOrEqual(CLEAR - 1e-9);
  });

  it("leaves the rocks a band, not a line: three tenths of a unit wide or more, inside the system's room", () => {
    expect(ROOM - ROCKS_FROM).toBeGreaterThanOrEqual(0.3 - 1e-9);
  });
});
