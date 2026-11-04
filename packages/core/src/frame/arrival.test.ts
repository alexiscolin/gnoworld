import { describe, expect, it } from "vitest";
import recorded from "../../../../app/lab/worlds.json" with { type: "json" };
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
import { LENT } from "./lent.ts";
import { outlineOf } from "./outline.ts";
import { BODY_PIXELS } from "../lod/ladder.ts";
import { postcardOf, postcardWorlds } from "./postcard.ts";
import { REST_SCREENS, STAR_HEART } from "./rest.ts";
import { rocksAt } from "./rocks.ts";
import { away, DEGREE, dot, focalOf, minus, type Seen } from "./restLook.ts";

// A system's arrival, its dynamic view (7v; 7d3's before, ADR-0002 §10): where the eye rests at a system, looking at its star, read through a
// camera of their own, the map's up kept up, swayed as the scene sways. Alexis, 2026-11-03: centred on its sun, its worlds at many depths,
// the near one cut by the frame, held still so it stays so.

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
// A world of Onyx's recorded file, as the dynamic view's count reads it (7v's design review, F4468): its use, its realms and callers.
interface Recorded {
  readonly id: string;
  readonly namespace: string;
  readonly realms: readonly { readonly callers: number | null }[];
}
// Onyx's recorded systems, each world's use its realms' callers and its realms (F4468), as the dynamic view's tests read them.
const onyxSystems = () =>
  systemsOf(
    (recorded as { worlds: readonly Recorded[] }).worlds.map(({ id, namespace, realms }) => ({
      id,
      namespace,
      use: realms.reduce((sum, { callers }) => sum + (callers ?? 0), 0) + realms.length,
    })),
  );
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
    // A ball's true outline, an oval off the view's axis, as the view is composed with (outline.ts).
    const box = outlineOf({ across: dot(from, right), up: dot(from, up), depth, radius: size }, focal, [width, height]);
    return { x, y, radius, depth, away: Math.hypot(from.x, from.y, from.z), ...box };
  };
}

// The postcard's worlds where they stand, in its plane as drawn, at their drawn size: they hold still (7v).
const placesOf = ({ postcard: { system, worlds, depth } }: Arrival) =>
  worlds.map((world, at) => {
    const out = { x: NaN, y: NaN, z: NaN };
    orbitPlace({ system, world }, 0, out);
    return { at: out, radius: world.radius * (depth[at] ?? NaN) };
  });
// Its worlds as `see` sees them, the nearest first: the near one, cut by the frame, and the others.
const nearestFirst = (see: ReturnType<typeof cameraOf>, arrival: Arrival) =>
  placesOf(arrival)
    .map(({ at, radius }) => see(at, radius))
    .sort((a, b) => a.away - b.away);
// Whether a body there is cut by the frame's sides or foot, its head under the header, `least` of it shown each way.
const cutByFrame = (seen: Seen, { width, height }: { width: number; height: number }, least: number) => {
  const shown = (Math.min(seen.right, width) - Math.max(seen.left, 0)) / (seen.right - seen.left);
  const up = (Math.min(seen.bottom, height) - seen.top) / (seen.bottom - seen.top);
  const cut = seen.left < 0 || seen.right > width || seen.bottom > height;
  return seen.depth > 0 && cut && seen.top >= 0.09 * height && shown >= least && up >= least;
};
// The round its star and whole worlds take on the screen: the near one reaches the frame's edge and is no part of it.
const roundOf = (see: ReturnType<typeof cameraOf>, arrival: Arrival, star: Seen) => {
  const others = nearestFirst(see, arrival).slice(1);
  return {
    ...star,
    radius: Math.max(STAR_HEART, ...others.map((one) => Math.hypot(one.x - star.x, one.y - star.y) + one.radius)),
  };
};
// How far its worlds reach from its star, its far belt with them: what the arrival frames.
const reachOf = ({ postcard: { system, worlds } }: Arrival) =>
  Math.max(system.belt ? ROOM : 0, ...worlds.map(({ orbit, radius }) => orbit + radius));
const normalOf = ({ tilt, node }: StarSystem) => ({
  x: -Math.sin(node) * Math.sin(tilt),
  y: Math.cos(tilt),
  z: Math.cos(node) * Math.sin(tilt),
});

// Each runs every case's whole search two or three times: 2.5 s alone at load 60, past 5 s in the gate's parallel run (7v), past 20 s
// at a load of 80 (lot 2's R2). Their own time is no cost bound; `holds in a file of 10,000 worlds` is.
const WHOLE_SEARCHES = 60_000;

describe("a system's arrival: the same address, the same postcard", () => {
  it(
    "gives a system the same arrival each time it is asked, in the same set, in any order",
    { timeout: WHOLE_SEARCHES },
    () => {
      for (const { system, systems } of allCases()) {
        const arrival = arrivalOf(system, systems);
        expect(arrivalOf(system, systems)).toEqual(arrival);
        expect(arrivalOf(system, [...systems].reverse())).toEqual(arrival);
      }
    },
  );

  it(
    "reads only what stands near: the systems more than 160 units off change nothing",
    () => {
      for (const { system, systems } of allCases()) {
        const near = systems.filter((other) => away(other.place, system.place) <= 160);
        expect(arrivalOf(system, near)).toEqual(arrivalOf(system, systems));
      }
    },
    WHOLE_SEARCHES,
  );

  it(
    "draws the worlds its still postcard would, each at its own phase and size under its crowd's cap, six at most, as no figure at any count",
    () => {
      for (const { system, systems } of allCases()) {
        const { postcard } = arrivalOf(system, systems);
        expect(postcard.worlds.length).toBeLessThanOrEqual(6);
        // Fewer than the postcard's own, the same rules choose them again: never a cut of a larger one's spread.
        expect(postcard.worlds).toEqual(postcardWorlds(system, postcard.worlds.length, true));
        // Each at its own size, its crowd's cap one scale on all (7v's design review, F4468).
        const bodies = system.worlds.filter(({ radius }) => radius >= GRAIN);
        const scale =
          Math.max(...bodies.map(({ radius }) => radius)) / Math.max(...bodies.map(({ radius, own }) => own ?? radius));
        for (const world of postcard.worlds) {
          const real = system.worlds.find(({ id }) => id === world.id);
          expect(world.radius).toBeCloseTo((real?.own ?? real?.radius ?? NaN) * scale, 9);
          expect(world.phase).toBe(real?.phase);
        }
      }
    },
    WHOLE_SEARCHES,
  );

  // The near world must stand at the frame's edge, which narrows the angles a system's worlds allow: forty twins come to ten ways or more.
  it("gives addresses their own angles: of forty systems alike but for their names, few are seen alike", () => {
    const [template] = SETS["80 mixed systems"]().filter(({ worlds }) => worlds.length === 3);
    if (template === undefined) throw new Error("no system of three");
    const named = Array.from({ length: 40 }, (_, at) => ({ ...template, id: `twin${String(at)}` }));
    const ways = named.map((system) => {
      const way = unit(minus(arrivalOf(system, [system]).eye, system.place));
      return `${way.x.toFixed(1)} ${way.y.toFixed(1)} ${way.z.toFixed(1)}`;
    });
    expect(new Set(ways).size).toBeGreaterThanOrEqual(10);
  });
});

// 7v (Alexis, 2026-11-03): the arrival is the system's dynamic view, its star centred, its worlds held still, the nearest cut by the frame.
describe("a system's arrival: a good angle", () => {
  it.each(ROWS)("on %s, centres %s's star on both screens, at rest and through its sway", (name, id) => {
    const { system, systems } = caseOf(name, id);
    const arrival = arrivalOf(system, systems);
    expect(arrival.look).toEqual(system.place);
    for (const screen of REST_SCREENS)
      for (const moved of movesOf(arrival)) {
        const star = cameraOf(arrival, screen, moved)(system.place);
        expect(star.depth).toBeGreaterThan(0);
        expect(star.x).toBeCloseTo(screen.width / 2, 6);
        expect(star.y).toBeCloseTo(screen.height / 2, 6);
      }
  });

  it.each(ROWS)("on %s, holds %s's worlds still, so its near one stays cut by the frame", (name, id) => {
    const { system, systems } = caseOf(name, id);
    expect(arrivalOf(system, systems).postcard.system.spin).toBe(0);
  });

  // The near world, as the mock-up Alexis approved draws it (2026-11-03, 14:09): cut by the frame, large, its head never under the header,
  // two others whole beside it at the least (the chief, after the design review's second pass); else every world whole round the star.
  it.each(ROWS)(
    "on %s, cuts %s's nearest world by the frame, 1.5 times every other's size or more, or stands it whole as the others",
    (name, id) => {
      const { system, systems } = caseOf(name, id);
      const arrival = arrivalOf(system, systems);
      expect(arrival.postcard.worlds.length).toBeLessThanOrEqual(6);
      const cutAtRest = REST_SCREENS.map((screen) => {
        const [near] = nearestFirst(cameraOf(arrival, screen), arrival);
        return near !== undefined && cutByFrame(near, screen, 0.3);
      });
      for (const [at, screen] of REST_SCREENS.entries())
        for (const moved of movesOf(arrival)) {
          const [near, ...others] = nearestFirst(cameraOf(arrival, screen, moved), arrival);
          const swayed = moved.x !== 0 || moved.y !== 0 || moved.z !== 0;
          if (near !== undefined) nearHolds([near, others], screen, { cut: cutAtRest[at] === true, swayed });
        }
    },
  );

  // The nearest world, cut by the frame where the view cut it at rest, else whole as the others.
  function nearHolds(
    [near, others]: readonly [Seen, readonly Seen[]],
    screen: (typeof REST_SCREENS)[number],
    { cut, swayed }: { cut: boolean; swayed: boolean },
  ) {
    if (!cut) {
      expect(near.left).toBeGreaterThanOrEqual(24);
      expect(near.right).toBeLessThanOrEqual(screen.width - 24);
      expect(near.top).toBeGreaterThanOrEqual(0.09 * screen.height);
      expect(near.bottom).toBeLessThanOrEqual(screen.height - 24);
      return;
    }
    expect(cutByFrame(near, screen, swayed ? 0.25 : 0.3)).toBe(true);
    expect(near.radius).toBeGreaterThanOrEqual(0.1 * screen.height);
    expect(near.radius).toBeLessThanOrEqual(0.5 * screen.height);
    for (const other of others) expect(near.radius).toBeGreaterThanOrEqual((swayed ? 1.35 : 1.5) * other.radius - 1e-9);
  }

  it.each(Object.keys(SETS) as SetName[])(
    "on %s, cuts the nearest world by the frame in 78 views in 100 or more",
    (name) => {
      const systems = SETS[name]();
      const views = systems
        .filter(({ worlds }) => worlds.some(({ radius }) => radius >= GRAIN))
        .map((system) => arrivalOf(system, systems));
      const cut = views.filter((arrival) => {
        const [near] = nearestFirst(cameraOf(arrival, REST_SCREENS[0]), arrival);
        return near !== undefined && cutByFrame(near, REST_SCREENS[0], 0.3);
      });
      expect(cut.length).toBeGreaterThanOrEqual(0.78 * views.length);
    },
  );

  it.each(ROWS)(
    "on %s, frames %s's other worlds whole under the header on both screens, through its sway",
    (name, id) => {
      const { system, systems } = caseOf(name, id);
      const arrival = arrivalOf(system, systems);
      for (const screen of REST_SCREENS)
        for (const moved of movesOf(arrival)) {
          const seen = nearestFirst(cameraOf(arrival, screen, moved), arrival);
          expect(seen).toHaveLength(arrival.postcard.worlds.length);
          for (const other of seen.slice(1)) {
            expect(other.left).toBeGreaterThanOrEqual(24);
            expect(other.right).toBeLessThanOrEqual(screen.width - 24);
            expect(other.top).toBeGreaterThanOrEqual(0.09 * screen.height);
            expect(other.bottom).toBeLessThanOrEqual(screen.height - 24);
          }
        }
    },
  );

  // Every system with a world of a body's size comes to a view with one or more (7d3's guarantee), every one whose postcard can draw two with
  // two or more, and nine in ten with every world their postcard can draw.
  it.each(Object.keys(SETS) as SetName[])(
    "on %s, draws every system with a world of a body's size, two of it where its postcard can, nine in ten the home's postcard's or more",
    (name) => {
      const systems = SETS[name]();
      const bodied = systems.filter(({ worlds }) => worlds.some(({ radius }) => radius >= GRAIN));
      const views = bodied.map((system) => [system, arrivalOf(system, systems).postcard.worlds.length] as const);
      for (const [system, count] of views)
        expect(count, system.id).toBeGreaterThanOrEqual(Math.min(2, postcardWorlds(system).length));
      const whole = views.filter(([system, count]) => count >= postcardWorlds(system).length);
      expect(whole.length).toBeGreaterThanOrEqual(0.9 * views.length);
    },
  );

  // A mouse at the window's edge leans the eye (half the home's at an arrival): most views hold through it, the others at rest and through
  // the sway, rather than lose a world.
  it(
    "holds seven views in ten or more through a mouse's lean: the others whole and off the star's heart, the near one on the screen",
    { timeout: 60_000 },
    () => {
      const cases = allCases().filter(({ system, systems }) => arrivalOf(system, systems).postcard.worlds.length > 0);
      const holding = cases.filter(({ system, systems }) => {
        const arrival = arrivalOf(system, systems);
        return REST_SCREENS.every((screen) =>
          movesOf(arrival, true).every((moved) => {
            const see = cameraOf(arrival, screen, moved);
            const star = see(system.place);
            const [near, ...others] = nearestFirst(see, arrival);
            const heart = (seen: Seen) => Math.hypot(seen.x - star.x, seen.y - star.y) - seen.radius >= STAR_HEART;
            const shows = near !== undefined && near.right > 0 && near.left < screen.width && near.top < screen.height;
            return (
              shows &&
              others.every(
                (seen) =>
                  heart(seen) &&
                  seen.left >= 0 &&
                  seen.right <= screen.width &&
                  seen.top >= 0.09 * screen.height &&
                  seen.bottom <= screen.height,
              )
            );
          }),
        );
      });
      expect(holding.length).toBeGreaterThanOrEqual(0.7 * cases.length);
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
    if (arrival.postcard.worlds.length > 0) expect((distance + reach) / (distance - reach)).toBeGreaterThanOrEqual(1.4);
    else expect(arrival.postcard.worlds).toEqual([]);
  });

  it.each(ROWS)("on %s, keeps %s's star's heart clear on arrival, through its sway: no world on it", (name, id) => {
    const { system, systems } = caseOf(name, id);
    const arrival = arrivalOf(system, systems);
    for (const screen of REST_SCREENS)
      for (const moved of movesOf(arrival)) {
        const see = cameraOf(arrival, screen, moved);
        const star = see(system.place);
        expect(star.depth).toBeGreaterThan(0);
        for (const { at, radius } of placesOf(arrival)) {
          const seen = see(at, radius);
          expect(Math.hypot(seen.x - star.x, seen.y - star.y) - seen.radius).toBeGreaterThanOrEqual(STAR_HEART);
        }
      }
  });

  // What gives a planetarium away (part-pipeline.md, Alexis 2026-11-02), as 7d6's `composed` reads it: a crowd, one on another, a row, the
  // star among the marks; a near world may cover a farther one by half at most, which is depth.
  it.each(ROWS)(
    "on %s, reads %s as the view at rest's rules would, its star with its worlds: no crowd, pile or row",
    (name, id) => {
      const { system, systems } = caseOf(name, id);
      const arrival = arrivalOf(system, systems);
      for (const screen of REST_SCREENS) {
        const see = cameraOf(arrival, screen);
        const [near, ...others] = nearestFirst(see, arrival);
        const frame = { deep: false, lights: [see(system.place)], ...screen };
        expect(near === undefined || others.length === 0 || composed(others, near, frame)).toBe(true);
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
        const [earth, ball] = [see(EARTH_PLACE, EARTH_RADIUS), roundOf(see, arrival, see(system.place))];
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
        const [earth, ball] = [see(EARTH_PLACE, EARTH_RADIUS), roundOf(see, arrival, see(place))];
        if (earth.depth > 0)
          expect(Math.hypot(earth.x - ball.x, earth.y - ball.y)).toBeGreaterThanOrEqual(earth.radius + ball.radius);
      }
    }
  });

  // Where no angle holds, as among neighbours packed closer than a cell: its star alone at the centre, its far belt framed whole, never from
  // straight above.
  it("frames a system no angle holds by its star at the centre and its far belt, whole on both screens, the map's up still up", () => {
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
    for (const screen of REST_SCREENS) {
      const see = cameraOf(arrival, screen);
      expect(see(system.place).x).toBeCloseTo(screen.width / 2, 6);
      for (let step = 0; step < 24; step += 1) {
        const [rim, angle] = [{ x: NaN, y: NaN, z: NaN }, (step * Math.PI) / 12];
        onPlane(arrival.postcard.system, { along: ROOM * Math.cos(angle), across: ROOM * Math.sin(angle), up: 0 }, rim);
        const { x, y } = see(rim);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(screen.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(screen.height);
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

  // A star that keeps three quarters of its halo or more (halo.ts, as the scene draws it) on the postcard would read as a second sun.
  it("puts no other haloed star on the postcard: one light a system", () => {
    for (const { system, systems } of allCases()) {
      const arrival = arrivalOf(system, systems);
      const see = cameraOf(arrival, REST_SCREENS[0]);
      const ball = roundOf(see, arrival, see(system.place));
      for (const other of systems) {
        const star = see(other.place);
        if (other === system || star.depth <= 0 || haloAt(star.away) < 0.75) continue;
        expect(Math.hypot(star.x - ball.x, star.y - ball.y)).toBeGreaterThanOrEqual(ball.radius);
      }
    }
  });

  it("varies the angle from one system to the next: from all round the map, at several slants and distances", () => {
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
    // Slants spread over the range, not a few set ones: a whole degree apart, a dozen at least.
    const slants = arrivals.map(([system, arrival]) =>
      Math.round(Math.asin(dot(unit(minus(arrival.eye, system.place)), normalOf(arrival.postcard.system))) / DEGREE),
    );
    expect(new Set(slants).size).toBeGreaterThanOrEqual(12);
    const fills = arrivals.map(([system, arrival]) => (reachOf(arrival) / away(arrival.eye, system.place)).toFixed(2));
    expect(new Set(fills).size).toBeGreaterThanOrEqual(3);
  });

  it("shows a system of grain alone by its star, whole and at the centre", () => {
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
    expect(star.x).toBeCloseTo(screen.width / 2, 6);
    expect(star.y).toBeCloseTo(screen.height / 2, 6);
  });

  // 7v's design review (F4468; the chief: as the mock-up Alexis approved, the views page at 14:09, about six worlds): a dynamic view drew
  // three of gnoswap's thirteen bodies, bound by the home's four and by the room its worlds keep to turn apart. Held still, they need only
  // stand apart in space, each at its own size under its crowd's cap, the nearest 1.5 times every other's at rest.
  it("draws up to six of a system's worlds in its dynamic view, gnoswap's five or more on Onyx, while the home's postcards keep four", () => {
    const systems = onyxSystems();
    const counts = systems.map((system) => arrivalOf(system, systems).postcard.worlds.length);
    expect(Math.max(...counts)).toBe(6);
    expect(counts.filter((count) => count >= 5).length).toBeGreaterThanOrEqual(5);
    const gnoswap = systems.find(({ id }) => id === "gnoswap");
    expect(gnoswap === undefined ? 0 : arrivalOf(gnoswap, systems).postcard.worlds.length).toBeGreaterThanOrEqual(5);
    for (const system of systems) expect(postcardOf(system, EARTH_PLACE).worlds.length).toBeLessThanOrEqual(4);
  });

  // The system's card at the top left (7v, the GUI board's option B: 104 to 195 px down, its name 370 px across at most, on the video's
  // screen): g1magld5's ringed giant stood over it. No world of a dynamic view stands in its room, a fourth across and a fifth down.
  it(
    "keeps the system's card's room at the top left clear of every world it draws, on both screens, Onyx's too",
    () => {
      const onyx = onyxSystems();
      const cases = [...allCases(), ...onyx.map((system) => ({ system, systems: onyx }))];
      for (const { system, systems } of cases) {
        const arrival = arrivalOf(system, systems);
        for (const screen of REST_SCREENS)
          for (const seen of nearestFirst(cameraOf(arrival, screen), arrival))
            expect(seen.left < 0.25 * screen.width && seen.top < 0.2 * screen.height, system.id).toBe(false);
      }
    },
    WHOLE_SEARCHES,
  );

  it("holds in a file of 10,000 worlds: the eye outside every room, six bodies at most, the same in any order", () => {
    const systems = systemsOf(mixed(2500, (system) => 1 + (system % 7)));
    const sample = systems.filter(({ worlds }) => worlds.length > 0).filter((_, at) => at % 125 === 0);
    expect(sample.length).toBeGreaterThanOrEqual(20);
    const reversed = [...systems].reverse();
    for (const system of sample) {
      const arrival = arrivalOf(system, systems);
      expect(arrival.postcard.worlds.length).toBeLessThanOrEqual(6);
      for (const other of systems)
        if (other !== system) expect(away(arrival.eye, other.place)).toBeGreaterThanOrEqual(ROOM + 1);
      expect(arrivalOf(system, reversed)).toEqual(arrival);
    }
  });
});

// Alexis, 2026-11-03, option B (part 7p): a system's arrival reads in depth as the view at rest's postcards do, the nearer of its bodies
// drawn larger, 1.5 times its neighbour or more, none at one height, none dropped to a dot; its worlds hold still (7v).
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

  it.each(ROWS)("on %s, draws %s's bodies 1.5 times apart in size or more, the nearer the larger", (name, id) => {
    const { system, systems } = caseOf(name, id);
    const arrival = arrivalOf(system, systems);
    expect(arrival.postcard.depth).toHaveLength(arrival.postcard.worlds.length);
    const seen = seenAt(arrival, 0);
    seen.forEach((one, at) => {
      for (const other of seen.slice(at + 1))
        expect(Math.max(one.radius, other.radius) / Math.min(one.radius, other.radius)).toBeGreaterThanOrEqual(1.5);
    });
    const byDepth = seenAt(arrival, 0).sort((a, b) => a.depth - b.depth);
    byDepth.forEach((near, at) => {
      const far = byDepth[at + 1];
      if (far !== undefined) expect(near.radius).toBeGreaterThan(far.radius);
    });
  });

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

  // The review of 7p (R2): the arrival judges its worlds at their drawn size, their own at the least: none of them, so drawn, stands on its
  // star's heart on arrival, on either screen (7d3 judges the heart there; through the turn a world may pass before its star).
  it.each(ROWS)(
    "on %s, keeps %s's star's heart clear of its bodies at their drawn size, own at the least, on arrival",
    (name, id) => {
      const { system, systems } = caseOf(name, id);
      const arrival = arrivalOf(system, systems);
      const { system: plane, worlds, depth } = arrival.postcard;
      expect(worlds.length).toBeLessThanOrEqual(6);
      for (const screen of REST_SCREENS) {
        const see = cameraOf(arrival, screen);
        const star = see(system.place);
        worlds.forEach((world, at) => {
          const out = { x: NaN, y: NaN, z: NaN };
          orbitPlace({ system: plane, world }, 0, out);
          const seen = see(out, world.radius * Math.max(1, depth[at] ?? NaN));
          expect(Math.hypot(seen.x - star.x, seen.y - star.y) - seen.radius).toBeGreaterThanOrEqual(STAR_HEART);
        });
      }
    },
  );

  it.each(ROWS)("on %s, drops none of %s's bodies to a dot", (name, id) => {
    const { system, systems } = caseOf(name, id);
    const seen = seenAt(arrivalOf(system, systems), 0);
    expect(seen.length).toBeLessThanOrEqual(6);
    for (const { radius } of seen) expect(radius).toBeGreaterThanOrEqual(1.5 * BODY_PIXELS - 1e-9);
  });

  // The bodies each arrival drew before the dynamic view (7p's, measured on cd7e9729), by its system's id: one in ten at most draws fewer,
  // where no angle stands a near world beside all 7d3 drew whole (7v: 5 of 80 and 2 of 23; most draw more, 2 where 7d3 drew 1).
  const BEFORE: Record<SetName, string> = {
    "80 mixed systems":
      "n0:1 n1:1 n10:1 n11:2 n12:1 n13:1 n14:1 n15:2 n16:2 n17:1 n18:1 n19:1 n2:1 n20:1 n21:1 n22:2 n23:2 n24:1 n25:1 n26:1 n27:2 " +
      "n28:2 n29:2 n3:2 n30:1 n31:1 n32:1 n33:2 n34:2 n35:2 n36:1 n37:1 n38:1 n39:2 n4:1 n40:2 n41:3 n42:1 n43:1 n44:1 n45:2 n46:2 " +
      "n47:3 n48:1 n49:1 n5:2 n50:1 n51:2 n52:2 n53:2 n54:1 n55:1 n56:1 n57:1 n58:2 n59:2 n6:1 n60:1 n61:1 n62:1 n63:2 n64:2 n65:2 " +
      "n66:1 n67:1 n68:1 n69:2 n7:1 n70:2 n71:3 n72:1 n73:1 n74:1 n75:2 n76:2 n77:3 n78:1 n79:1 n8:1 n9:2",
    "crowds and singles":
      "busy:2 mid:1 n0:1 n1:1 n10:1 n11:2 n12:1 n13:1 n14:1 n15:2 n16:2 n17:1 n18:1 n19:1 n2:1 n3:2 n4:1 n5:2 n6:1 n7:1 n8:1 n9:2 test:2",
  };
  it.each(Object.keys(SETS) as SetName[])(
    "draws as many bodies at each arrival on %s as 7d3's did, nine in ten",
    (name) => {
      const systems = SETS[name]();
      const before = new Map(
        BEFORE[name].split(" ").map((row) => [row.split(":")[0], Number(row.split(":")[1])] as const),
      );
      const fewer = systems
        .filter(({ worlds }) => worlds.length > 0)
        .filter((system) => arrivalOf(system, systems).postcard.worlds.length < (before.get(system.id) ?? 0));
      expect(fewer.length).toBeLessThanOrEqual(0.1 * systems.length);
    },
  );
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

// Alexis, 2026-11-03 (7v): the ambient rocks are a depth cue of a system's dynamic view, as of the home's (7p): decor in front, from the
// view's own seed, off every world it draws, its label's room, and its star's heart.
describe("a system's dynamic view's rocks (7v)", () => {
  // In front: nearer the eye than any world it draws; off a world's label's room (core's settle.ts PLACE, as rocks.ts keeps it); clear of
  // the star's heart; a few pixels to sixty across; at rest and through the sway.
  const LABEL = { wide: 200, high: 32, stem: 12, gap: 22 };
  // Every rock clear on `screen` with the eye `moved`.
  function rocksClear(
    arrival: Arrival,
    rocks: ReturnType<typeof rocksAt>,
    [screen, moved]: readonly [(typeof REST_SCREENS)[number], Point],
  ) {
    const see = cameraOf(arrival, screen, moved);
    const [star, worlds] = [see(arrival.look), nearestFirst(see, arrival)];
    for (const rock of rocks) rockClear(see(rock.place, rock.radius), rock.radius, { star, worlds });
  }
  function rockClear(seen: Seen, radius: number, { star, worlds }: { star: Seen; worlds: readonly Seen[] }) {
    expect(seen.depth).toBeGreaterThan(0);
    expect(seen.radius).toBeLessThanOrEqual(70);
    expect(Math.hypot(seen.x - star.x, seen.y - star.y) - seen.radius).toBeGreaterThanOrEqual(STAR_HEART);
    for (const world of worlds) {
      expect(seen.away + radius).toBeLessThan(world.away);
      const label =
        Math.abs(seen.x - world.x) < LABEL.wide - LABEL.stem + seen.radius &&
        Math.abs(seen.y - world.y) < world.radius + LABEL.gap + LABEL.high + seen.radius;
      expect(Math.hypot(seen.x - world.x, seen.y - world.y) - seen.radius - world.radius >= 0 && !label).toBe(true);
    }
  }
  it("lays a few rocks in front of most dynamic views, off every world drawn, its label's room and its star's heart", () => {
    const cases = allCases();
    let laid = 0;
    for (const { system, systems } of cases) {
      const arrival = arrivalOf(system, systems);
      const rocks = rocksAt(arrival, LENT);
      expect(rocks.length).toBeLessThanOrEqual(7);
      if (rocks.length > 0) laid += 1;
      for (const screen of REST_SCREENS)
        for (const moved of movesOf(arrival)) rocksClear(arrival, rocks, [screen, moved]);
    }
    expect(laid).toBeGreaterThanOrEqual(0.8 * cases.length);
  });

  // The least share of its nearest a view's leans keep each way in the frame's room on `screen`, under the header and over the ticker (34
  // px of 1,080), each way of the lean as far as the view's room says; none where its top goes under the header.
  const leanKept = (arrival: Arrival, screen: (typeof REST_SCREENS)[number]) => {
    const room = arrival.room ?? { right: 1, left: 1, up: 1, down: 1 };
    const [top, bottom] = [0.09 * screen.height, screen.height - (34 * screen.height) / 1080];
    const shares = LEANED.map(([across, upward]) => {
      const by = { x: NaN, y: NaN, z: NaN };
      const [x, y] = [across * (across >= 0 ? room.right : room.left), upward * (upward >= 0 ? room.up : room.down)];
      toMap({ x: CENTRE.x + x * ARRIVAL_LEAN, y: CENTRE.y + y * ARRIVAL_LEAN, z: CENTRE.z }, by);
      const [near] = nearestFirst(cameraOf(arrival, screen, by), arrival);
      if (near === undefined) return 1;
      const shown = (Math.min(near.right, screen.width) - Math.max(near.left, 0)) / (near.right - near.left);
      const up = (Math.min(near.bottom, bottom) - Math.max(near.top, top)) / (near.bottom - near.top);
      return near.top >= top - 1e-9 ? Math.min(shown, up) : 0;
    });
    return Math.min(...shares);
  };

  // The design review's second pass (F4468; the chief): at a mouse's lean to the right gnoswap's pool left under the ticker, a sliver. Each
  // way of a view's lean, across and up, is clamped so its nearest keeps a seventh of itself each way in the frame's room at every corner.
  it(
    "clamps each view's lean so its nearest stays in the frame's room, never under the ticker or the header, Onyx's too",
    () => {
      const onyx = onyxSystems();
      let clamped = 0;
      for (const { system, systems } of [...allCases(), ...onyx.map((one) => ({ system: one, systems: onyx }))]) {
        const arrival = arrivalOf(system, systems);
        if (Object.values(arrival.room ?? {}).some((share) => share < 1)) clamped += 1;
        for (const screen of REST_SCREENS) {
          const [rest] = nearestFirst(cameraOf(arrival, screen), arrival);
          if (rest !== undefined && cutByFrame(rest, screen, 0))
            expect(leanKept(arrival, screen), system.id).toBeGreaterThanOrEqual(0.15 - 1e-9);
        }
      }
      expect(clamped).toBeGreaterThan(0);
    },
    WHOLE_SEARCHES,
  );

  // The design review's second pass (F4468, the planetarium's tell): g1magld5's view stood blog, streak and agents in a column on one side,
  // 112 px across over 340 up at 1,728. Three worlds or more spread across no less than 40 degrees off the upright, as the home's columns.
  it(
    "stands no three of a dynamic view's worlds in a column at rest, their spread across within 40 degrees of the upright, Onyx's too",
    () => {
      const onyx = onyxSystems();
      const spread = (values: readonly number[]) => Math.max(...values) - Math.min(...values);
      const column = (seen: readonly Seen[]) =>
        seen.length >= 3 &&
        spread(seen.map(({ x }) => x)) < Math.tan((40 * Math.PI) / 180) * spread(seen.map(({ y }) => y));
      let judged = 0;
      for (const { system, systems } of [...allCases(), ...onyx.map((one) => ({ system: one, systems: onyx }))]) {
        const arrival = arrivalOf(system, systems);
        if (arrival.postcard.worlds.length < 3) continue;
        judged += 1;
        for (const screen of REST_SCREENS)
          expect(
            column(nearestFirst(cameraOf(arrival, screen), arrival)),
            `${system.id} at ${String(screen.width)}`,
          ).toBe(false);
      }
      expect(judged).toBeGreaterThan(10);
    },
    WHOLE_SEARCHES,
  );

  // The chief, after the design review's second pass (F4468, the mock-up wins): the nearest is cut where two others stand whole beside it;
  // a view of two stands both whole rather than one cut beside one (14 of the mixed set's views and 2 of Onyx's cut so before).
  it(
    "never cuts the nearest beside a single other: a view of two stands both whole, Onyx's too",
    () => {
      const onyx = onyxSystems();
      for (const { system, systems } of [...allCases(), ...onyx.map((one) => ({ system: one, systems: onyx }))]) {
        const arrival = arrivalOf(system, systems);
        if (arrival.postcard.worlds.length !== 2) continue;
        const [near] = nearestFirst(cameraOf(arrival, REST_SCREENS[0]), arrival);
        if (near === undefined) continue;
        expect(cutByFrame(near, REST_SCREENS[0], 0), system.id).toBe(false);
      }
    },
    WHOLE_SEARCHES,
  );

  // The design review's second pass (F4468, the mock-up's rocks in front): at a system the hero gives way and its card stands at the top left,
  // yet the rocks kept the hero's room and stood on the card; gnoswap's seven were all pebbles there, no near one in front.
  it("lays a dynamic view's rocks off the system's card, not the hero's room, and a near one in front of gnoswap", () => {
    const onyx = onyxSystems();
    for (const system of onyx.filter(({ worlds }) => worlds.length > 0)) {
      const arrival = arrivalOf(system, onyx);
      for (const screen of REST_SCREENS) {
        const see = cameraOf(arrival, screen);
        for (const { place, radius } of rocksAt(arrival, LENT)) {
          const seen = see(place, radius);
          expect(seen.left < 0.25 * screen.width && seen.top < 0.2 * screen.height, system.id).toBe(false);
        }
      }
    }
    const gnoswap = onyx.find(({ id }) => id === "gnoswap");
    if (gnoswap === undefined) throw new Error("no gnoswap");
    const arrival = arrivalOf(gnoswap, onyx);
    const see = cameraOf(arrival, REST_SCREENS[0]);
    expect(
      Math.max(...rocksAt(arrival, LENT).map(({ place, radius }) => see(place, radius).radius)),
    ).toBeGreaterThanOrEqual(30);
  });

  it("lays the same rocks for the same view", () => {
    for (const { system, systems } of allCases().slice(0, 20)) {
      const arrival = arrivalOf(system, systems);
      expect(rocksAt(arrival, LENT)).toEqual(rocksAt(arrival, LENT));
    }
  });
});
