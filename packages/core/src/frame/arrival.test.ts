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
import { ARRIVAL_LEAN, arrivalOf, type Arrival } from "./arrival.ts";
import { composed } from "./composition.ts";
import { CENTRE, onPlane, orbitPlace, toMap } from "./disc.ts";
import { haloAt } from "./halo.ts";
import { BODY_PIXELS } from "../lod/ladder.ts";
import { postcardWorlds } from "./postcard.ts";
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

// Where the eye stands off the arrival's: at rest, the four corners of its sway along the arrival's own axes, and the eight edges of a
// mouse's lean, half the home's at an arrival, along the stage's across and up (eye.ts): what the view must hold with motion on.
const SWAYED: readonly (readonly [number, number])[] = [
  [SWAY.across, SWAY.up],
  [SWAY.across, -SWAY.up],
  [-SWAY.across, SWAY.up],
  [-SWAY.across, -SWAY.up],
];
const LEANED: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
function movesOf({ eye, look }: Arrival, leaning = false): Point[] {
  const { right, up } = axesOf(eye, look);
  const swayed = SWAYED.map(([across, upward]) => along(along({ x: 0, y: 0, z: 0 }, right, across), up, upward));
  const leaned = LEANED.map(([across, upward]) => {
    const out = { x: NaN, y: NaN, z: NaN };
    toMap({ x: CENTRE.x + across * ARRIVAL_LEAN, y: CENTRE.y + upward * ARRIVAL_LEAN, z: CENTRE.z }, out);
    return out;
  });
  return [{ x: 0, y: 0, z: 0 }, ...swayed, ...(leaning ? leaned : [])];
}

/** A camera at the arrival's eye moved by `moved` on the map, looking at its look, the map's up kept up, on a screen. */
function cameraOf(
  { eye: rest, look }: Arrival,
  { width, height }: { readonly width: number; readonly height: number },
  moved: Point = { x: 0, y: 0, z: 0 },
) {
  const eye = along(rest, moved, 1);
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

  it("draws the worlds the view at rest would, each at its own phase and size, four at most, as no figure at any count", () => {
    for (const { system, systems } of allCases()) {
      const { postcard } = arrivalOf(system, systems);
      expect(postcard.worlds.length).toBeLessThanOrEqual(4);
      // Fewer than the postcard's own, the same rules choose them again: never a cut of a larger one's spread.
      expect(postcard.worlds).toEqual(postcardWorlds(system, postcard.worlds.length));
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
        for (const moved of movesOf(arrival)) wholeThrough(cameraOf(arrival, screen, moved), arrival, screen);
    },
  );

  // A mouse at the window's edge leans the eye (half the home's at an arrival): most arrivals hold through it, the others at rest and through
  // the sway, rather than lose a world.
  it("holds nine arrivals in ten or more whole and clear through a mouse's lean", () => {
    const cases = allCases();
    const holding = cases.filter(({ system, systems }) => {
      const arrival = arrivalOf(system, systems);
      return REST_SCREENS.every((screen) =>
        movesOf(arrival, true).every((moved) => {
          const see = cameraOf(arrival, screen, moved);
          const star = see(system.place);
          return placesOf(arrival, 0).every(({ at, radius }) => {
            const seen = see(at, radius);
            const inside =
              seen.left >= 0 &&
              seen.right <= screen.width &&
              seen.top >= 0.09 * screen.height &&
              seen.bottom <= screen.height;
            return inside && Math.hypot(seen.x - star.x, seen.y - star.y) - seen.radius >= STAR_HEART;
          });
        }),
      );
    });
    expect(holding.length).toBeGreaterThanOrEqual(0.9 * cases.length);
  });

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
      for (const moved of movesOf(arrival)) {
        const see = cameraOf(arrival, screen, moved);
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

  // Where no angle holds, as among neighbours packed closer than a cell: its star alone, its far belt framed whole, never from straight above.
  it("frames a system no angle holds by its star and its far belt, whole on both screens, the map's up still up", () => {
    const [template] = SETS["80 mixed systems"]().filter(({ worlds }) => worlds.length === 2);
    if (template === undefined) throw new Error("no system of two");
    const system = { ...template, id: "packed", belt: true, place: { x: 400, y: 0, z: 400 } };
    const steps = [-30, -24, -18, -12, -6, 0, 6, 12, 18, 24, 30];
    const packed = steps
      .flatMap((x) => steps.flatMap((y) => steps.map((z) => ({ x: 400 + x, y, z: 400 + z }))))
      .filter(({ x, y, z }) => x !== 400 || y !== 0 || z !== 400)
      .map((place) => ({ ...template, id: `p${String(place.x)},${String(place.y)},${String(place.z)}`, place }));
    const arrival = arrivalOf(system, [system, ...packed]);
    expect(arrival.postcard.worlds).toEqual([]);
    expect(Math.abs(unit(minus(arrival.look, arrival.eye)).y)).toBeLessThanOrEqual(Math.sin(60 * DEGREE));
    for (const screen of REST_SCREENS) wholeThrough(cameraOf(arrival, screen), arrival, screen);
  });

  it("stands the eye outside every other system's room", () => {
    for (const { system, systems } of allCases()) {
      const { eye } = arrivalOf(system, systems);
      for (const other of systems)
        if (other !== system) expect(away(eye, other.place)).toBeGreaterThanOrEqual(ROOM + 1);
    }
  });

  // A star that keeps three quarters of its halo or more (halo.ts, as the scene draws it) on the postcard would read as a second sun.
  it("puts no other haloed star on the postcard: one light a system", () => {
    for (const { system, systems } of allCases()) {
      const arrival = arrivalOf(system, systems);
      const see = cameraOf(arrival, REST_SCREENS[0]);
      const ball = see(system.place, reachOf(arrival));
      for (const other of systems) {
        const star = see(other.place);
        if (other === system || star.depth <= 0 || haloAt(star.away) < 0.75) continue;
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
    // Slants spread over the range, not a few set ones: a whole degree apart, a dozen at least.
    const slants = arrivals.map(([system, arrival]) =>
      Math.round(Math.asin(dot(unit(minus(arrival.eye, system.place)), normalOf(arrival.postcard.system))) / DEGREE),
    );
    expect(new Set(slants).size).toBeGreaterThanOrEqual(12);
    // The star's place spreads across and up the screen: never one band.
    const stars = arrivals.map(([system, arrival]) => cameraOf(arrival, screen)(system.place));
    const aside = stars.map(({ x }) => Math.abs(x - screen.width / 2) / screen.width);
    expect(Math.max(...aside) - Math.min(...aside)).toBeGreaterThanOrEqual(0.06);
    // The header's band turns away more stars set high than low: the heights still spread, above the middle and below it.
    const lifted = stars.map(({ y }) => (y - screen.height / 2) / screen.height);
    expect(Math.max(...lifted) - Math.min(...lifted)).toBeGreaterThanOrEqual(0.12);
    expect(lifted.some((up) => up < 0)).toBe(true);
    expect(lifted.some((down) => down > 0)).toBe(true);
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

// Alexis, 2026-11-03, option B (part 7p): a system's arrival reads in depth as the view at rest's postcards do, the nearer of its bodies
// drawn larger, 1.5 times its neighbour or more through its turn, none at one height on arrival, none dropped to a dot.
describe("a system's arrival in depth (7p)", () => {
  // Each body at its drawn share of its size, where it stands `seconds` on, seen from the arrival's eye on the video's screen.
  const seenAt = (arrival: Arrival, seconds: number) => {
    const see = cameraOf(arrival, REST_SCREENS[0]);
    const { system, worlds, depth } = arrival.postcard;
    return worlds.map((world, at) => {
      const out = { x: NaN, y: NaN, z: NaN };
      orbitPlace({ system, world }, seconds, out);
      return see(out, world.radius * (depth[at] ?? NaN));
    });
  };

  it.each(ROWS)(
    "on %s, draws %s's bodies 1.5 times apart in size or more through its turn, the nearer the larger",
    (name, id) => {
      const { system, systems } = caseOf(name, id);
      const arrival = arrivalOf(system, systems);
      expect(arrival.postcard.depth).toHaveLength(arrival.postcard.worlds.length);
      for (const seconds of turnOf(arrival)) {
        const seen = seenAt(arrival, seconds);
        seen.forEach((one, at) => {
          for (const other of seen.slice(at + 1))
            expect(Math.max(one.radius, other.radius) / Math.min(one.radius, other.radius)).toBeGreaterThanOrEqual(1.5);
        });
      }
      const byDepth = seenAt(arrival, 0).sort((a, b) => a.depth - b.depth);
      byDepth.forEach((near, at) => {
        const far = byDepth[at + 1];
        if (far !== undefined) expect(near.radius).toBeGreaterThan(far.radius);
      });
    },
  );

  // At one height: less than a tenth of the screen's height apart up it, and less than 40 degrees off level (rest.test.ts).
  it.each(ROWS)("on %s, stands no two of %s's neighbouring bodies at one height on arrival", (name, id) => {
    const { system, systems } = caseOf(name, id);
    const arrival = arrivalOf(system, systems);
    const seen = seenAt(arrival, 0);
    expect(seen).toHaveLength(arrival.postcard.worlds.length);
    for (const one of seen) {
      const [nearest] = seen
        .filter((other) => other !== one)
        .sort((a, b) => Math.hypot(a.x - one.x, a.y - one.y) - Math.hypot(b.x - one.x, b.y - one.y));
      if (nearest === undefined) continue;
      const [across, up] = [Math.abs(nearest.x - one.x), Math.abs(nearest.y - one.y)];
      expect(up >= 0.1 * REST_SCREENS[0].height || up >= Math.tan(40 * DEGREE) * across).toBe(true);
    }
  });

  it.each(ROWS)("on %s, drops none of %s's bodies to a dot through its turn", (name, id) => {
    const { system, systems } = caseOf(name, id);
    const arrival = arrivalOf(system, systems);
    for (const seconds of turnOf(arrival))
      for (const { radius } of seenAt(arrival, seconds))
        expect(radius).toBeGreaterThanOrEqual(1.5 * BODY_PIXELS - 1e-9);
  });

  // The bodies each arrival drew before the depth (7p, measured on b582d1aa), by its system's id: none is dropped to get there.
  const BEFORE: Record<SetName, string> = {
    "80 mixed systems":
      "n0:1 n1:1 n10:1 n11:2 n12:1 n13:1 n14:1 n15:2 n16:2 n17:1 n18:1 n19:1 n2:1 n20:1 n21:1 n22:2 n23:2 n24:1 n25:1 n26:1 n27:2 " +
      "n28:2 n29:2 n3:2 n30:1 n31:1 n32:1 n33:2 n34:2 n35:2 n36:1 n37:1 n38:1 n39:2 n4:1 n40:2 n41:3 n42:1 n43:1 n44:1 n45:2 n46:2 " +
      "n47:3 n48:1 n49:1 n5:2 n50:1 n51:2 n52:2 n53:2 n54:1 n55:1 n56:1 n57:1 n58:2 n59:2 n6:1 n60:1 n61:1 n62:1 n63:2 n64:2 n65:2 " +
      "n66:1 n67:1 n68:1 n69:2 n7:1 n70:2 n71:3 n72:1 n73:1 n74:1 n75:2 n76:2 n77:3 n78:1 n79:1 n8:1 n9:2",
    "crowds and singles":
      "busy:2 mid:1 n0:1 n1:1 n10:1 n11:2 n12:1 n13:1 n14:1 n15:2 n16:2 n17:1 n18:1 n19:1 n2:1 n3:2 n4:1 n5:2 n6:1 n7:1 n8:1 n9:2 test:2",
  };
  it.each(Object.keys(SETS) as SetName[])("draws as many bodies at each arrival on %s as before the depth", (name) => {
    const systems = SETS[name]();
    const counts = systems
      .filter(({ worlds }) => worlds.length > 0)
      .map((system) => `${system.id}:${String(arrivalOf(system, systems).postcard.worlds.length)}`);
    expect(counts.join(" ")).toBe(BEFORE[name]);
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
