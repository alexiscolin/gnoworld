import { describe, expect, it } from "vitest";
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
import { orbitTime, SWAY } from "../space/drift.ts";
import { orbitPlace } from "./disc.ts";
import { CELL } from "../cosmos/cosmos.ts";
import { composed, coveredShare, evenRow } from "./composition.ts";
import { deepOf, judgeOf, projectsOf } from "./deep.ts";
import { earthSystemOf } from "./earthOrbit.ts";
import { LENT } from "./lent.ts";
import { rocksOf } from "./rocks.ts";
import { DIVE, diveAt } from "./dive.ts";
import { haloAt } from "./halo.ts";
import { BODY_PIXELS } from "../lod/ladder.ts";
import { PLACE } from "../lod/settle.ts";
import { drawnOf, postcardOf, shapeOf } from "./postcard.ts";
import { postcardsOf } from "./restCards.ts";
import { cameraTowards, looksFrom, type Look } from "./restLook.ts";
import { FIELD_OF_VIEW, HERO_ZONE, REST_SCREENS, restView, STAR_HEART, type RestView } from "./rest.ts";

// The view at rest (7d6): the Earth at the canvas's centre, the great star beside it, two postcards, one world close to the eye and cut by
// the frame, every other system a distant star, the eye placed from the data. These read it through a camera of their own: the eye looks
// at the Earth, the disc's up kept up.
const DEGREE = Math.PI / 180;
const files = {
  "one system": [{ id: "a/w0", namespace: "a", use: 1 }],
  "3 systems": spread(3, 2),
  "7 systems": spread(7, 2),
  "100 systems": spread(100, 2),
  "1,000 systems": spread(1_000, 2),
  "10,000 systems": spread(10_000, 2),
  "crowds and singles": [...spread(40, 1), ...crowd("busy", 172), ...crowd("test", 127), ...crowd("mid", 30)],
  "one namespace of 20,000": [...spread(30, 1), ...crowd("huge", 20_000)],
  "300 systems of four": spread(300, 4),
} as const satisfies Record<string, readonly WorldHeld[]>;

// The three systems all stand beyond the great star: a view that lights the Earth has them behind the eye, so theirs stands it unlit.
const UNLIT = new Set<string>(["3 systems"]);
// Through the home's lens (7d9) the seven systems read well only from farther out, 30 to 34 units, and the three systems' view frames one
// of them whole, not two (the chief, 2026-11-03: composed farther out before any view that only fits).
const FARTHER = new Set<string>(["7 systems"]);
const ONE_CARD = new Set<string>(["3 systems"]);

function spread(systems: number, each: number): WorldHeld[] {
  return Array.from({ length: systems * each }, (_, at) => ({
    id: `n${String(at % systems)}/w${String(at)}`,
    namespace: `n${String(at % systems)}`,
    use: 1 + (at % 5) * 40,
  }));
}

function crowd(namespace: string, count: number): WorldHeld[] {
  return Array.from({ length: count }, (_, at) => ({ id: `${namespace}/w${String(at)}`, namespace, use: at % 9 }));
}

// Sixty single worlds and thirty systems of six: poor and rich systems mixed.
function richMix(): WorldHeld[] {
  const rich = Array.from({ length: 180 }, (_, at) => ({
    id: `rich${String(at % 30)}/w${String(at)}`,
    namespace: `rich${String(at % 30)}`,
    use: 1 + (at % 5) * 40,
  }));
  return [...spread(60, 1), ...rich];
}

interface Seen {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly depth: number;
  readonly away: number;
}

const minus = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (a: Point) => {
  const length = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / length, y: a.y / length, z: a.z / length };
};
const cross = (a: Point, b: Point) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** A camera at the view's eye, looking at the Earth, on a screen; swayed `across` and `upward` in its own axes. */
function cameraOf(
  { eye: rest }: RestView,
  { width, height }: { readonly width: number; readonly height: number },
  [across, upward]: readonly [number, number] = [0, 0],
) {
  const restAhead = unit(minus(EARTH_PLACE, rest));
  const restRight = unit(cross(restAhead, { x: 0, y: 1, z: 0 }));
  const restUp = cross(restRight, restAhead);
  const eye = {
    x: rest.x + across * restRight.x + upward * restUp.x,
    y: rest.y + across * restRight.y + upward * restUp.y,
    z: rest.z + across * restRight.z + upward * restUp.z,
  };
  const ahead = unit(minus(EARTH_PLACE, eye));
  const right = unit(cross(ahead, { x: 0, y: 1, z: 0 }));
  const up = cross(right, ahead);
  const focal = height / 2 / Math.tan((FIELD_OF_VIEW * DEGREE) / 2);
  return (at: Point, size = 0): Seen => {
    const from = minus(at, eye);
    const depth = dot(from, ahead);
    return {
      x: width / 2 + (focal * dot(from, right)) / depth,
      y: height / 2 - (focal * dot(from, up)) / depth,
      radius: (focal * size) / Math.max(depth, 1e-9),
      depth,
      away: Math.hypot(from.x, from.y, from.z),
    };
  };
}

// A ball's true outline on a screen: the box of its surface's points, seen through `see`, sampled close enough to read to a pixel.
function outline(see: (at: Point) => Seen, centre: Point, radius: number) {
  const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (let ring = 0; ring <= 180; ring += 1)
    for (let step = 0; step < 360; step += 1) {
      const [lat, lon] = [(ring * Math.PI) / 180 - Math.PI / 2, (step * Math.PI) / 180];
      const { x, y } = see({
        x: centre.x + radius * Math.cos(lat) * Math.cos(lon),
        y: centre.y + radius * Math.sin(lat),
        z: centre.z + radius * Math.cos(lat) * Math.sin(lon),
      });
      [box.left, box.right, box.top, box.bottom] = [
        Math.min(box.left, x),
        Math.max(box.right, x),
        Math.min(box.top, y),
        Math.max(box.bottom, y),
      ];
    }
  return box;
}

const bodiesOf = (system: StarSystem) => system.worlds.filter(({ radius }) => radius >= GRAIN);
const placeOf = (system: StarSystem, world: StarSystem["worlds"][number], seconds: number) => {
  const out = { x: NaN, y: NaN, z: NaN };
  orbitPlace({ system, world }, seconds, out);
  return out;
};
// A turn of its orbit, in 64 steps: what a world passes through with motion on.
const phases = (system: StarSystem) =>
  Array.from({ length: 64 }, (_, step) => (step * 2 * Math.PI) / 64 / Math.abs(system.spin));
// The rest's eye and the four corners of its sway, on each screen: what the view must hold with motion on.
const SWAYED: readonly (readonly [number, number])[] = [
  [0, 0],
  [SWAY.across, SWAY.up],
  [SWAY.across, -SWAY.up],
  [-SWAY.across, SWAY.up],
  [-SWAY.across, -SWAY.up],
];
const SCREENS_SWAYED = REST_SCREENS.flatMap((screen) => SWAYED.map((swayed) => [screen, swayed] as const));

const overlaps = (seen: Seen, { x, y }: { readonly x: number; readonly y: number }, radius: number) =>
  Math.hypot(seen.x - x, seen.y - y) < seen.radius + radius;
const inHero = (seen: Seen, width: number, height: number) =>
  seen.x - seen.radius < HERO_ZONE.right * width && seen.y + seen.radius > HERO_ZONE.top * height;
const whole = (seen: Seen, width: number, height: number) =>
  seen.depth > 0 &&
  seen.x - seen.radius >= 0 &&
  seen.x + seen.radius <= width &&
  seen.y - seen.radius >= 0 &&
  seen.y + seen.radius <= height;
const offScreen = (seen: Seen, width: number, height: number) =>
  seen.depth <= 0 ||
  seen.x + seen.radius < 0 ||
  seen.x - seen.radius > width ||
  seen.y + seen.radius < 0 ||
  seen.y - seen.radius > height;

// A postcard's worlds as drawn, each with its system: its bodies spread round its star from the eye at rest, in its plane as drawn, its
// other worlds as specks at their own orbits.
const shownOf = (system: StarSystem, { eye }: RestView) => {
  const postcard = postcardOf(system, eye);
  return [
    ...postcard.worlds.map((world) => ({ system: postcard.system, world })),
    ...bodiesOf(system)
      .filter((world) => !postcard.worlds.some(({ id }) => id === world.id))
      .map((world) => ({ system, world })),
  ];
};

const closeOf = (systems: readonly StarSystem[], { close }: RestView) =>
  close === undefined ? undefined : systems[close.system]?.worlds[close.world];

const made = (file: readonly WorldHeld[]) => {
  const systems = systemsOf(file);
  return { systems, view: restView(systems) };
};
// The view's depth bodies, read through the judge the view lends, as the scene's chunk asks them (7p).
const deepBodies = (systems: readonly StarSystem[], view: RestView) =>
  deepOf(systems, view, judgeOf(systems, view, LENT));

describe("what the view is composed for", () => {
  // Alexis, 2026-11-03 ("tout pourrait être un peu plus gros"), 1.2 times by the chief: the home's lens, which the scene's camera takes
  // while the cosmos shows, magnifies 1.2 times the app camera's 50 degrees.
  it("is the video's screen and a 16:9 window of the same height, through the home's lens, 1.2 times the app camera's 50 degrees", () => {
    expect(REST_SCREENS).toEqual([
      { width: 1728, height: 1080 },
      { width: 1920, height: 1080 },
    ]);
    expect(Math.tan(25 * DEGREE) / Math.tan((FIELD_OF_VIEW * DEGREE) / 2)).toBeCloseTo(1.2, 12);
  });

  it("keeps the hero's room, left of 45% of the width and under 58% of the height, and the great star's heart of 40 pixels", () => {
    expect(HERO_ZONE).toEqual({ right: 0.45, top: 0.58 });
    expect(STAR_HEART).toBe(40);
  });
});

// The search runs on the page's main thread once a file comes (reviews 2 and 3, 7d6): only the Earth's nearest systems are laid out. The
// least of several runs after a warm-up: a busy machine only makes a run slower.
describe("the search's cost", () => {
  const least = (systems: readonly StarSystem[]) => {
    restView(systems);
    let best = Infinity;
    for (let run = 0; run < 9; run += 1) {
      const start = Date.now();
      restView(systems);
      best = Math.min(best, Date.now() - start);
    }
    return best;
  };

  it("finds the view of 10,000 systems, and of 20,000 of ten worlds each, in 100 ms or less", () => {
    expect(least(systemsOf(spread(10_000, 2)))).toBeLessThanOrEqual(100);
    expect(least(systemsOf(spread(20_000, 10)))).toBeLessThanOrEqual(100);
  });

  // The review of 7d9: 54 systems of four, whose best views stand rows on the way down, took 114 ms, every view judged once the best was
  // refused; 104 systems of eight, with no close world, 152 ms.
  it("finds it in 100 ms or less where the best views stand rows on the way down, or where no close world stands", () => {
    expect(least(systemsOf(spread(54, 4)))).toBeLessThanOrEqual(100);
    expect(least(systemsOf(spread(104, 8)))).toBeLessThanOrEqual(100);
  });
});

describe("the eye at rest", () => {
  it.each(Object.entries(files))(
    "looks at the Earth from 24 to 28 units, or 30 to 34 where only those read well, 6 to 30 degrees over the disc, with %s",
    (name, file) => {
      const { view } = made(file);
      const from = minus(view.eye, EARTH_PLACE);
      const away = Math.hypot(from.x, from.y, from.z);
      expect(away).toBeGreaterThanOrEqual((FARTHER.has(name) ? 30 : 24) - 1e-9);
      expect(away).toBeLessThanOrEqual((FARTHER.has(name) ? 34 : 28) + 1e-9);
      const slant = Math.asin(from.y / away);
      expect(slant).toBeGreaterThanOrEqual(6 * DEGREE - 1e-9);
      expect(slant).toBeLessThanOrEqual(30 * DEGREE + 1e-9);
    },
  );

  // Alexis, 2026-11-02: "la Terre un peu plus grosse et illuminée", 100 to 120 pixels against frame 4's 95; then, 2026-11-03, everything
  // 1.2 times larger through the home's lens, from the same eyes.
  it.each(Object.entries(files))(
    "stands the Earth 120 to 144 pixels across, 99 to 113 farther out, at both screens, with %s",
    (name, file) => {
      const { view } = made(file);
      for (const screen of REST_SCREENS) {
        const { radius } = cameraOf(view, screen)(EARTH_PLACE, EARTH_RADIUS);
        expect(2 * radius).toBeGreaterThanOrEqual(FARTHER.has(name) ? 99 : 120);
        expect(2 * radius).toBeLessThanOrEqual(FARTHER.has(name) ? 113 : 144);
      }
    },
  );

  it.each(Object.entries(files).filter(([name]) => !UNLIT.has(name)))(
    "lights 45% of the Earth's disc or more from the great star, as it stands, with %s",
    (_, file) => {
      const { view } = made(file);
      const [toEye, toStar] = [unit(minus(view.eye, EARTH_PLACE)), unit(minus({ x: 0, y: 0, z: 0 }, EARTH_PLACE))];
      // The share of a lit ball's disc in day, seen from an angle at the ball between its star and the eye.
      expect((1 + dot(toEye, toStar)) / 2).toBeGreaterThanOrEqual(0.45);
    },
  );

  it("gives the same set the same view, in any order", () => {
    const file = files["crowds and singles"];
    expect(restView(systemsOf([...file].reverse()))).toEqual(made(file).view);
  });

  it("stands the great star beside the Earth: on screen, right of it by a hundred pixels or more, at both screens", () => {
    for (const file of Object.values(files)) {
      const { view } = made(file);
      for (const { width, height } of REST_SCREENS) {
        const star = cameraOf(view, { width, height })({ x: 0, y: 0, z: 0 });
        expect(star.depth).toBeGreaterThan(0);
        expect(star.x - width / 2).toBeGreaterThanOrEqual(100);
        expect(star.x).toBeLessThan(width);
        expect(Math.abs(star.y - height / 2)).toBeLessThanOrEqual(0.3 * height);
      }
    }
  });

  it("goes without a close world, and draws its one postcard whole, in a universe of one system", () => {
    const { view } = made(files["one system"]);
    expect(view.close).toBeUndefined();
    expect(view.postcards).toHaveLength(1);
  });

  it("stands the Earth alone with its star in a universe of none", () => {
    const view = restView(systemsOf([]));
    expect(view.postcards).toEqual([]);
    expect(view.close).toBeUndefined();
  });
});

describe("the postcards", () => {
  it.each(Object.entries(files))(
    "draws two neighbour systems whole, one where the home's lens frames no two, at every phase, at both screens, with %s",
    (name, file) => {
      const { systems, view } = made(file);
      const neighbours = systems.filter((system) => system.worlds.length > 0).length;
      const most = ONE_CARD.has(name) ? 1 : 2;
      expect(view.postcards).toHaveLength(Math.min(most, neighbours - (view.close === undefined ? 0 : 1)));
      expect(new Set(view.postcards).size).toBe(view.postcards.length);
      expect(view.postcards).not.toContain(view.close?.system);
      for (const index of view.postcards) {
        const system = systems[index];
        if (system === undefined) throw new Error("no postcard");
        expect(system.worlds.length).toBeGreaterThan(0);
        const places = shownOf(system, view).flatMap(({ system: plane, world }) =>
          phases(system).map((seconds) => ({ at: placeOf(plane, world, seconds), radius: world.radius })),
        );
        for (const [{ width, height }, swayed] of SCREENS_SWAYED) {
          const see = cameraOf(view, { width, height }, swayed);
          expect(whole(see(system.place), width, height)).toBe(true);
          for (const { at, radius } of places) expect(whole(see(at, radius), width, height)).toBe(true);
        }
      }
    },
  );

  // Alexis, 2026-11-02: each postcard draws as many bodies as its system stands apart in its cell, the richer systems first.
  it.each(Object.entries(files))(
    "takes them among the Earth's 24 nearest systems, each drawing a body or more, with %s",
    (_, file) => {
      const { systems, view } = made(file);
      const nearest = systems
        .map((system, index) => ({ system, index }))
        .filter(({ system }) => system.worlds.length > 0)
        .sort(
          (a, b) =>
            Math.hypot(...Object.values(minus(a.system.place, EARTH_PLACE))) -
            Math.hypot(...Object.values(minus(b.system.place, EARTH_PLACE))),
        )
        .slice(0, 24);
      const shown = view.postcards.map((index) => {
        const system = systems[index];
        return system === undefined ? 0 : postcardOf(system, view.eye).worlds.length;
      });
      for (const index of view.postcards) expect(nearest.map((near) => near.index)).toContain(index);
      for (const bodies of shown) expect(bodies).toBeGreaterThan(0);
    },
  );

  // 7d6's review (lots 3 and 4): the search's order, a close world before the postcards' bodies. No other set decides it: here the best view
  // with no close world draws five bodies in its postcards (measured with the close world's score at 0), this one four.
  it("takes a close world first, then the richest postcard of the Earth's 24 nearest, with poor and rich systems mixed", () => {
    const { systems, view } = made(richMix());
    const counted = (system: StarSystem | undefined) =>
      system === undefined ? 0 : Math.min(3, postcardOf(system, view.eye).worlds.length);
    const awayOf = ({ place }: StarSystem) => Math.hypot(...Object.values(minus(place, EARTH_PLACE)));
    const nearest = systems
      .filter((system) => system.worlds.length > 0)
      .sort((a, b) => awayOf(a) - awayOf(b))
      .slice(0, 24)
      .map(counted);
    expect(view.close).toBeDefined();
    expect(Math.max(...view.postcards.map((index) => counted(systems[index])))).toBe(Math.max(...nearest));
    expect(Math.min(...nearest)).toBeLessThan(Math.max(...nearest));
  });

  it("draws four bodies of a postcard at most, of a body's size, its others as specks: frame 4's densest group is four", () => {
    const [, system] = systemsOf([...crowd("big", 12), { id: "big/top", namespace: "big", use: 500 }]);
    if (system === undefined) throw new Error("no system");
    const { worlds } = postcardOf(system, { x: 0, y: 40, z: 60 });
    expect(worlds.length).toBeGreaterThan(0);
    expect(worlds.length).toBeLessThanOrEqual(4);
    for (const world of worlds) expect(world.radius).toBeGreaterThanOrEqual(GRAIN);
    expect(worlds.map(({ id }) => id)).toContain("big/top");
  });

  // The chief, 2026-11-02, on Alexis's "pas ces 4 planètes aussi grosses et en rond pile-poil équidistantes": each world at its own orbit
  // and phase, widened alike, at its own size.
  it.each(Object.entries(files))(
    "keeps each world's own phase, and its orbit widened as its system's others are, never narrowed, with %s",
    (_, file) => {
      const { systems, view } = made(file);
      for (const index of view.postcards) {
        const system = systems[index];
        if (system === undefined) throw new Error("no postcard");
        const { worlds } = postcardOf(system, view.eye);
        const spreads = worlds.map((world) => {
          const own = system.worlds.find(({ id }) => id === world.id);
          if (own === undefined) throw new Error("not its world");
          expect(world.phase).toBe(own.phase);
          expect(world.radius).toBe(own.radius);
          return world.orbit / own.orbit;
        });
        for (const spread of spreads) expect(spread).toBeCloseTo(spreads[0] ?? NaN, 9);
        expect(spreads[0]).toBeGreaterThanOrEqual(1);
      }
    },
  );

  // Two gaps alike within 15% read as a figure drawn on purpose.
  it.each(Object.entries(files))(
    "draws no regular figure: of three bodies or more, no two gaps between neighbours alike within 15%, with %s",
    (_, file) => {
      const { systems, view } = made(file);
      const figures = view.postcards
        .map((index) => systems[index])
        .flatMap((system) => (system === undefined ? [] : [postcardOf(system, view.eye).worlds]))
        .filter((worlds) => worlds.length >= 3);
      expect(figures.length).toBeLessThanOrEqual(2);
      for (const worlds of figures) {
        const round = [...worlds].sort((a, b) => (a.phase % (2 * Math.PI)) - (b.phase % (2 * Math.PI)));
        const at = (world: (typeof round)[number]) => ({
          x: world.orbit * Math.cos(world.phase),
          y: world.orbit * Math.sin(world.phase),
        });
        const gaps = round.map((world, step) => {
          const next = round[(step + 1) % round.length] ?? world;
          const [a, b] = [at(world), at(next)];
          return Math.hypot(a.x - b.x, a.y - b.y) - world.radius - next.radius;
        });
        gaps.forEach((gap, step) => {
          for (const other of gaps.slice(step + 1))
            expect(Math.abs(gap - other)).toBeGreaterThan(0.15 * Math.max(gap, other));
        });
      }
    },
  );
});

// Alexis, 2026-11-03 ("pas 2 planètes de la même taille au même niveau, c'est pas naturel"), option B: a postcard's worlds read in depth
// by their drawn size, the nearer larger, 1.5 times its neighbour or more through its turn, none at one height, none dropped to a dot.
describe("the postcards in depth (7p)", () => {
  // 7d9's sets beside the view's own: the rule as briefed left one body per postcard in each.
  const sets = {
    ...files,
    "54 of four": spread(54, 4),
    "104 of eight": spread(104, 8),
    "rich mix": richMix(),
  } as const satisfies Record<string, readonly WorldHeld[]>;
  // The bodies each postcard drew before the depth (7p, measured on b582d1aa): none is dropped to get there.
  const BEFORE: Record<keyof typeof sets, readonly number[]> = {
    "one system": [1],
    "3 systems": [1],
    "7 systems": [1, 1],
    "100 systems": [2, 1],
    "1,000 systems": [1, 1],
    "10,000 systems": [1, 1],
    "crowds and singles": [1, 1],
    "one namespace of 20,000": [1, 1],
    "300 systems of four": [2, 2],
    "54 of four": [2, 2],
    "104 of eight": [3, 3],
    "rich mix": [3, 1],
  };
  const rows = Object.keys(sets) as (keyof typeof sets)[];
  // Each postcard's bodies as drawn, at a share of their size, in its plane as drawn, and eight instants of its turn.
  const cardsOf = (name: keyof typeof sets) => {
    const { systems, view } = made(sets[name]);
    return view.postcards.map((index) => {
      const system = systems[index];
      if (system === undefined) throw new Error("no postcard");
      const { system: plane, worlds, depth } = postcardOf(system, view.eye);
      const drawn = worlds.map((world, at) => ({ ...world, radius: world.radius * (depth[at] ?? NaN) }));
      const turn = (2 * Math.PI) / Math.abs(system.spin);
      const instants = Array.from({ length: 8 }, (_, step) => (step * turn) / 8);
      return { view, plane, worlds, drawn, instants };
    });
  };
  const seenOf = (
    { view, plane, drawn }: { view: RestView; plane: StarSystem; drawn: readonly Orbiter[] },
    seconds: number,
  ) => {
    const see = cameraOf(view, REST_SCREENS[0]);
    return drawn.map((world) => see(placeOf(plane, world, seconds), world.radius));
  };

  it.each(rows)(
    "draws each postcard's bodies 1.5 times apart in size or more, at rest and through its turn, with %s",
    (name) => {
      for (const { view, plane, worlds, drawn, instants } of cardsOf(name))
        for (const seconds of instants) {
          const seen = seenOf({ view, plane, drawn }, seconds);
          expect(seen).toHaveLength(worlds.length);
          seen.forEach((one, at) => {
            for (const other of seen.slice(at + 1))
              expect(Math.max(one.radius, other.radius) / Math.min(one.radius, other.radius)).toBeGreaterThanOrEqual(
                1.5,
              );
          });
        }
    },
  );

  it.each(rows)("draws the nearer of a postcard's bodies the larger at rest, with %s", (name) => {
    for (const { view, plane, worlds, drawn } of cardsOf(name)) {
      const byDepth = seenOf({ view, plane, drawn }, 0).sort((a, b) => a.depth - b.depth);
      expect(byDepth).toHaveLength(worlds.length);
      byDepth.forEach((near, at) => {
        const far = byDepth[at + 1];
        if (far !== undefined) expect(near.radius).toBeGreaterThan(far.radius);
      });
    }
  });

  // Two neighbours stand at one height when their centres are less than a tenth of the screen's height apart up the screen and their line
  // stands less than 40 degrees off level: a far postcard's bodies stand closer than a tenth of the height, and read apart by their slant.
  it.each(rows)("stands no two neighbouring bodies of a postcard at one height at rest, with %s", (name) => {
    const { height } = REST_SCREENS[0];
    for (const { view, plane, worlds, drawn } of cardsOf(name)) {
      const seen = seenOf({ view, plane, drawn }, 0);
      expect(seen).toHaveLength(worlds.length);
      for (const one of seen) {
        const others = seen.filter((other) => other !== one);
        const [nearest] = others.sort(
          (a, b) => Math.hypot(a.x - one.x, a.y - one.y) - Math.hypot(b.x - one.x, b.y - one.y),
        );
        if (nearest === undefined) continue;
        const [across, up] = [Math.abs(nearest.x - one.x), Math.abs(nearest.y - one.y)];
        expect(up >= 0.1 * height || up >= Math.tan((40 * Math.PI) / 180) * across).toBe(true);
      }
    }
  });

  it.each(rows)(
    "drops no body of a postcard to a dot: each a body's least size on screen or more through its turn, with %s",
    (name) => {
      for (const { view, plane, drawn, instants } of cardsOf(name))
        for (const seconds of instants)
          for (const { radius } of seenOf({ view, plane, drawn }, seconds))
            expect(radius).toBeGreaterThanOrEqual(1.5 * BODY_PIXELS - 1e-9);
    },
  );

  // The review of 7p (R2): the search judges a postcard at its drawn size, its own at the least. Its ball, round each world's orbit and
  // larger radius, with the search's 24 pixels round it, stands whole on both screens and clear of the Earth.
  it.each(rows)(
    "judges each postcard whole and off the Earth at its drawn size, its own at the least, with %s",
    (name) => {
      for (const { view, plane, worlds, drawn } of cardsOf(name)) {
        const reach = Math.max(
          ...worlds.map(({ orbit, radius }, at) => orbit + Math.max(radius, drawn[at]?.radius ?? NaN)),
        );
        for (const screen of REST_SCREENS) {
          const see = cameraOf(view, screen);
          const [seen, earth] = [see(plane.place, reach), see(EARTH_PLACE, EARTH_RADIUS)];
          const ball = { ...seen, radius: seen.radius + 24 };
          expect(whole(ball, screen.width, screen.height)).toBe(true);
          expect(Math.hypot(ball.x - earth.x, ball.y - earth.y)).toBeGreaterThanOrEqual(ball.radius + earth.radius);
        }
      }
    },
  );

  // The review of 7p (R2): "104 of eight" draws n51, a postcard, its far world lifted past its own size. Slid sideways, the eye finds where
  // its ball fits on both screens at the worlds' own size and not as drawn: the search refuses it there, and takes it where both fit.
  it("refuses a postcard whose ball fits at its worlds' own size and not as drawn, and takes it where both fit", () => {
    const { systems, view } = made(sets["104 of eight"]);
    const index = systems.findIndex(({ id }) => id === "n51");
    const system = systems[index];
    if (system === undefined) throw new Error("no n51");
    expect(Math.max(...postcardOf(system, view.eye).depth)).toBeGreaterThan(1.2);
    const postcard = postcardOf(system, view.eye).worlds;
    const reach = Math.max(...system.worlds.map(({ orbit, radius }) => orbit + radius));
    const held = { index, system, bodies: system.worlds, postcard, reach };
    const fitsAt = (looks: readonly Look[], ball: number) =>
      looks.every((look) => {
        const seen = look.ball(system.place, ball);
        const earth = Math.hypot(seen.x - look.earth.x, seen.y - look.earth.y) - seen.radius - look.earth.radius;
        return look.whole(seen, 24) && look.clear(seen, 24) && earth >= 24;
      });
    const outcomes = { refused: 0, taken: 0 };
    for (let step = -400; step <= 400; step += 1) {
      const right = cameraTowards(view.eye, EARTH_PLACE).right;
      const eye = {
        x: view.eye.x + right.x * step * 0.05,
        y: view.eye.y + right.y * step * 0.05,
        z: view.eye.z + right.z * step * 0.05,
      };
      const looks = looksFrom(cameraTowards(eye, EARTH_PLACE));
      const [first] = looks;
      if (first === undefined) continue;
      const drawn = drawnOf(shapeOf(system, postcard, first.camera), 1);
      const [own, wide] = [reach, Math.max(reach, ...drawn.map(({ orbit, radius }) => orbit + radius))];
      const cards = postcardsOf(looks, { near: [held], lenient: true, most: 1 });
      if (fitsAt(looks, own) && !fitsAt(looks, wide)) {
        expect(cards).toBeUndefined();
        outcomes.refused += 1;
      } else if (fitsAt(looks, wide) && cards !== undefined) outcomes.taken += 1;
    }
    expect(outcomes.refused).toBeGreaterThan(0);
    expect(outcomes.taken).toBeGreaterThan(0);
  });

  it.each(rows)("draws as many bodies in each postcard as before the depth, with %s", (name) => {
    const { systems, view } = made(sets[name]);
    const counts = view.postcards.map((index) => {
      const system = systems[index];
      return system === undefined ? 0 : postcardOf(system, view.eye).worlds.length;
    });
    expect(counts).toEqual(BEFORE[name]);
  });
});

// The bodies drawn at rest: the postcards' four largest worlds of a body's size, spread round their star, and the close world.
const drawn = (systems: readonly StarSystem[], view: RestView) => [
  ...view.postcards.flatMap((index) => {
    const system = systems[index];
    if (system === undefined) return [];
    const postcard = postcardOf(system, view.eye);
    return postcard.worlds.map((world) => ({ system: postcard.system, world }));
  }),
  ...(view.close === undefined
    ? []
    : [{ system: systems[view.close.system], world: systems[view.close.system]?.worlds[view.close.world] }].flatMap(
        ({ system, world }) => (system === undefined || world === undefined ? [] : [{ system, world }]),
      )),
];

// Alexis, 2026-11-03 ("la perspective doit être partout", his references in .claude/tmp/slice-7/inspi-depth/): the arrival reads in depth
// across its whole frame, real worlds of other nearby systems drawn as bodies in the middle and far, sizes spanning about ten times with
// the close world; none invented, none over another, none of one size at one height beside its neighbour.
describe("the view's depth (7p)", () => {
  const sets = {
    "one system": files["one system"],
    "3 systems": files["3 systems"],
    "7 systems": files["7 systems"],
    "100 systems": files["100 systems"],
    "1,000 systems": files["1,000 systems"],
    "10,000 systems": files["10,000 systems"],
    "crowds and singles": files["crowds and singles"],
    "one namespace of 20,000": files["one namespace of 20,000"],
    "300 systems of four": files["300 systems of four"],
    "54 of four": spread(54, 4),
    "104 of eight": spread(104, 8),
    "rich mix": richMix(),
  } as const satisfies Record<string, readonly WorldHeld[]>;
  const rows = Object.keys(sets) as (keyof typeof sets)[];
  // No other system stands near enough in the first three; in "crowds and singles" the view's bodies stand near a line through the great
  // star, and any body added beside them would make a row. The review's rules (eight instants, no fourth of a row, off the great star's
  // glow; the chief's option A, 2026-11-03) leave none in "one namespace of 20,000" and "54 of four".
  const NONE = new Set<string>([
    "one system",
    "3 systems",
    "7 systems",
    "crowds and singles",
    "one namespace of 20,000",
    "54 of four",
  ]);
  // "7 systems", framed farther out by 7d9, stands the Earth and a postcard's body 1.45 times apart at one height: holding the rule there
  // moves that view, which 7d9's tests pin (7p's report, for the chief).
  const TWINS = new Set<string>(["7 systems"]);
  // Those with a close world, which the span is asked of.
  const CLOSE = ["1,000 systems", "one namespace of 20,000", "300 systems of four", "rich mix"] as const;
  // The view's depth bodies, and everything the view draws at rest as a spot on the video's screen: the Earth, the close world, the
  // postcards' bodies at their drawn share, the depth bodies; with the postcards' balls.
  const frameOf = (name: keyof typeof sets) => {
    const { systems, view } = made(sets[name]);
    const deep = deepBodies(systems, view);
    const see = cameraOf(view, REST_SCREENS[0]);
    const close = closeOf(systems, view);
    const closeSystem = view.close === undefined ? undefined : systems[view.close.system];
    const cards = view.postcards.flatMap((index) => {
      const system = systems[index];
      return system === undefined ? [] : [{ system, card: postcardOf(system, view.eye) }];
    });
    const spots = [
      ...(close === undefined || closeSystem === undefined ? [] : [see(placeOf(closeSystem, close, 0), close.radius)]),
      ...cards.flatMap(({ card }) =>
        card.worlds.map((world, at) => see(placeOf(card.system, world, 0), world.radius * (card.depth[at] ?? NaN))),
      ),
    ];
    const bodies = deep.map(({ system, world }) => {
      const held = systems[system];
      const own = held?.worlds[world];
      if (held === undefined || own === undefined) throw new Error("no such world");
      return { held, own, seen: see(placeOf(held, own, 0), own.radius) };
    });
    // At `seconds` into the turn, on the video's screen: the Earth, the close world held still, the postcards' bodies at their share, and
    // the depth bodies; the glowing stars, the great star's, the postcards' and any other's with three quarters of its halo or more.
    const at = (seconds: number) => ({
      own: [
        see(EARTH_PLACE, EARTH_RADIUS),
        ...(close === undefined || closeSystem === undefined
          ? []
          : [see(placeOf(closeSystem, close, 0), close.radius)]),
        ...cards.flatMap(({ card }) =>
          card.worlds.map((world, at) =>
            see(placeOf(card.system, world, seconds), world.radius * (card.depth[at] ?? NaN)),
          ),
        ),
      ],
      deep: bodies.map(({ held, own }) => see(placeOf(held, own, seconds), own.radius)),
      stars: [
        see({ x: 0, y: 0, z: 0 }),
        ...cards.map(({ card }) => see(card.system.place)),
        ...systems
          .filter((_, index) => index > 0 && !view.postcards.includes(index))
          .map((system) => see(system.place))
          .filter(({ depth, away }) => depth > 0 && haloAt(away) >= 0.75),
      ],
    });
    // Eight instants through the longest turn of what turns: the postcards and the depth bodies.
    const spins = [...cards.map(({ system }) => system.spin), ...bodies.map(({ held }) => held.spin)].filter(
      (spin) => spin !== 0,
    );
    const turn = (2 * Math.PI) / Math.min(...spins.map((spin) => Math.abs(spin)));
    const instants = Array.from({ length: 8 }, (_, step) => (spins.length === 0 ? 0 : (step * turn) / 8));
    return { systems, view, deep, see, cards, spots, bodies, earth: see(EARTH_PLACE, EARTH_RADIUS), at, instants };
  };
  const onScreen = ({ x, y }: { x: number; y: number }) =>
    x >= 0 && x <= REST_SCREENS[0].width && y >= 0 && y <= REST_SCREENS[0].height;

  it.each(rows)(
    "draws one to four real worlds of other nearby systems as bodies (none where they would make a row), one a system, with %s",
    (name) => {
      const { view, deep, systems, bodies } = frameOf(name);
      expect(deep.length).toBeGreaterThanOrEqual(NONE.has(name) ? 0 : 1);
      expect(deep.length).toBeLessThanOrEqual(4);
      expect(new Set(deep.map(({ system }) => system)).size).toBe(deep.length);
      for (const { system } of deep) {
        expect(view.postcards).not.toContain(system);
        expect(system).not.toBe(view.close?.system);
        expect(systems[system]?.worlds.length).toBeGreaterThan(0);
      }
      for (const { own } of bodies) expect(own.radius).toBeGreaterThanOrEqual(GRAIN);
      // Taken from the nearest systems out, each a body's size, so the near ones are tried first.
      const aways = deep.map(({ system }) =>
        Math.hypot(...Object.values(minus(systems[system]?.place ?? view.eye, view.eye))),
      );
      expect(aways).toEqual([...aways].sort((a, b) => a - b));
    },
  );

  // 7d7's dive comes down to the view at rest, the depth bodies with it: on no frame of the way down, every sixtieth of a second, the
  // postcards turning as they do, do they make a row at like gaps the view's own bodies did not make (7d9's rule allows those a tenth of a
  // second).
  it.each(rows)("adds no row at like gaps on any frame of the way down, with %s", (name) => {
    const { systems, view, cards, bodies } = frameOf(name);
    const close = closeOf(systems, view);
    const closeSystem = systems[view.close?.system ?? -1];
    const out = { x: NaN, y: NaN, z: NaN };
    const boxed = (spots: readonly Seen[]) => spots.map((spot) => ({ ...spot, left: 0, right: 0, top: 0, bottom: 0 }));
    let frames = 0;
    for (let frame = 1; frame < DIVE.seconds * 60; frame += 1) {
      diveAt(view.eye, frame / (DIVE.seconds * 60), out);
      const see = cameraOf({ ...view, eye: { ...out } }, REST_SCREENS[0]);
      const seconds = orbitTime(frame / 60);
      const shown = (spots: readonly Seen[]) => spots.filter(({ radius, depth }) => depth > 0 && radius >= BODY_PIXELS);
      const own = shown([
        see(EARTH_PLACE, EARTH_RADIUS),
        ...cards.flatMap(({ card }) =>
          card.worlds.map((world, at) =>
            see(placeOf(card.system, world, seconds), world.radius * (card.depth[at] ?? NaN)),
          ),
        ),
        ...(close === undefined || closeSystem === undefined
          ? []
          : [see(placeOf(closeSystem, close, 0), close.radius)]),
      ]);
      const deep = shown(bodies.map(({ held, own: world }) => see(placeOf(held, world, seconds), world.radius)));
      if (deep.length > 0 && evenRow(boxed([...own, ...deep]))) expect(evenRow(boxed(own))).toBe(true);
      frames += 1;
    }
    expect(frames).toBeGreaterThan(60);
  });

  it.each(rows)(
    "stands each whole and clear on both screens through its turn, off the Earth's ring, every body and postcard, with %s",
    (name) => {
      const { systems, view, bodies, cards, deep } = frameOf(name);
      expect(bodies).toHaveLength(deep.length);
      const close = closeOf(systems, view);
      const closeSystem = view.close === undefined ? undefined : systems[view.close.system];
      for (const { width, height } of REST_SCREENS) {
        const see = cameraOf(view, { width, height });
        const earth = see(EARTH_PLACE, EARTH_RADIUS);
        const star = see({ x: 0, y: 0, z: 0 });
        const others = [
          ...(close === undefined || closeSystem === undefined
            ? []
            : [see(placeOf(closeSystem, close, 0), close.radius)]),
          ...cards.map(({ system, card }) =>
            see(system.place, Math.max(...card.worlds.map(({ orbit, radius }) => orbit + radius))),
          ),
          ...bodies.map(({ held, own }) => see(held.place, own.orbit + own.radius)),
        ];
        for (const { held, own } of bodies) {
          const ball = see(held.place, own.orbit + own.radius);
          expect(whole(ball, width, height)).toBe(true);
          expect(inHero(ball, width, height)).toBe(false);
          expect(overlaps(ball, star, STAR_HEART)).toBe(false);
          expect(Math.hypot(ball.x - earth.x, ball.y - earth.y)).toBeGreaterThanOrEqual(ball.radius + 2 * earth.radius);
          for (const other of others.filter((one) => one !== ball && Math.hypot(one.x - ball.x, one.y - ball.y) > 1e-6))
            expect(Math.hypot(other.x - ball.x, other.y - ball.y) - ball.radius - other.radius).toBeGreaterThanOrEqual(
              24,
            );
        }
      }
    },
  );

  // At one height: less than a tenth of the screen's height apart up it, and less than 40 degrees off level; of one size: within 1.5 times.
  it.each(rows.filter((name) => !TWINS.has(name)))(
    "stands no two neighbours of one size at one height anywhere in the frame, with %s",
    (name) => {
      const { spots, bodies, earth } = frameOf(name);
      const all = [earth, ...spots, ...bodies.map(({ seen }) => seen)];
      for (const one of all) {
        const [nearest] = all
          .filter((other) => other !== one)
          .sort((a, b) => Math.hypot(a.x - one.x, a.y - one.y) - Math.hypot(b.x - one.x, b.y - one.y));
        if (nearest === undefined) continue;
        const like = Math.max(one.radius, nearest.radius) < 1.5 * Math.min(one.radius, nearest.radius);
        const [across, up] = [Math.abs(nearest.x - one.x), Math.abs(nearest.y - one.y)];
        const level = up < 0.1 * REST_SCREENS[0].height && up < Math.tan((40 * Math.PI) / 180) * across;
        expect(like && level).toBe(false);
      }
    },
  );

  // The review of 7p (R6): a depth body turns round its star as the postcards do. At none of eight instants of the turn does it stand of
  // one size, within 1.5 times, beside its nearest neighbour or as that neighbour's nearest, at one height or above it (40 degrees).
  it.each(rows)(
    "stands no depth body of one size by a neighbour, level or in a column, at any of eight instants of the turn, with %s",
    (name) => {
      const { at, instants } = frameOf(name);
      expect(instants).toHaveLength(8);
      const H = REST_SCREENS[0].height;
      const slant = Math.tan((40 * Math.PI) / 180);
      for (const seconds of instants) {
        const { own, deep } = at(seconds);
        const all = [...own, ...deep];
        const nearest = (one: Seen) =>
          all
            .filter((other) => other !== one)
            .sort((a, b) => Math.hypot(a.x - one.x, a.y - one.y) - Math.hypot(b.x - one.x, b.y - one.y))[0];
        for (const body of deep)
          for (const other of all.filter((one) => one !== body && (nearest(body) === one || nearest(one) === body))) {
            const like = Math.max(body.radius, other.radius) < 1.5 * Math.min(body.radius, other.radius);
            const [across, up] = [Math.abs(other.x - body.x), Math.abs(other.y - body.y)];
            const level = up < 0.1 * H && up < slant * across;
            const column = across < slant * up;
            expect(like && (level || column)).toBe(false);
          }
      }
    },
  );

  // The design review of 7p (D1): gnotif made the fourth of a row with gnoslinger and two glowing stars, 34 pixels high across 546. No depth
  // body makes the fourth of four marks, bodies, the Earth and stars mixed, within a twentieth of the height across more than 0.15 of the
  // width.
  it.each(rows)(
    "makes the fourth of no level row on the screen, stars among its marks, at any of eight instants, with %s",
    (name) => {
      const { at, instants } = frameOf(name);
      expect(instants).toHaveLength(8);
      for (const seconds of instants) {
        const { own, deep, stars } = at(seconds);
        deep.forEach((body, rank) => {
          const marks = [...own, ...deep.slice(0, rank), ...stars].filter(onScreen);
          marks.forEach((a, i) => {
            marks.slice(i + 1).forEach((b, j) => {
              marks.slice(i + j + 2).forEach((c) => {
                const [ys, xs] = [[a, b, c, body].map(({ y }) => y), [a, b, c, body].map(({ x }) => x)];
                const level = Math.max(...ys) - Math.min(...ys) < 0.05 * REST_SCREENS[0].height;
                if (onScreen(body))
                  expect(level && Math.max(...xs) - Math.min(...xs) > 0.15 * REST_SCREENS[0].width).toBe(false);
              });
            });
          });
        });
      }
    },
  );

  // The design review of 7p (D5): dao, its disc 97 pixels off the great star's heart, read as a hole in its glow; each depth body's disc
  // keeps a tenth of the screen's height off the star's heart at every instant.
  it.each(rows)("keeps every depth body off the great star's glow at every instant, with %s", (name) => {
    const { at, instants } = frameOf(name);
    expect(instants).toHaveLength(8);
    for (const seconds of instants) {
      const { deep, stars } = at(seconds);
      const [star] = stars;
      if (star === undefined) throw new Error("no great star");
      for (const body of deep)
        expect(Math.hypot(body.x - star.x, body.y - star.y) - body.radius).toBeGreaterThanOrEqual(
          0.1 * REST_SCREENS[0].height,
        );
    }
  });

  // Past 1.5 times the Earth's distance: the review's rules leave "104 of eight" one, at 1.79 times (the chief's option A, 2026-11-03).
  it.each(rows)(
    "draws them in depth: the farthest past 1.5 times the Earth's distance, none under 1.5 times a body's least size, with %s",
    (name) => {
      const { bodies, earth } = frameOf(name);
      if (NONE.has(name)) expect(bodies).toEqual([]);
      else expect(Math.max(...bodies.map(({ seen }) => seen.away))).toBeGreaterThan(1.5 * earth.away);
      for (const { seen } of bodies) expect(seen.radius).toBeGreaterThanOrEqual(1.5 * BODY_PIXELS);
    },
  );

  it.each(CLOSE)(
    "spans the frame's sizes about ten times beside the close world: the largest eight times the smallest or more, with %s",
    (name) => {
      const { spots, bodies, earth, view } = frameOf(name);
      expect(view.close).toBeDefined();
      const radii = [earth, ...spots, ...bodies.map(({ seen }) => seen)].map(({ radius }) => radius);
      expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThanOrEqual(8);
    },
  );

  it.each(rows)(
    "crowds, piles and lines up nothing with its new bodies, as the view at rest is judged, with %s",
    (name) => {
      const { spots, bodies, earth, view, see, deep } = frameOf(name);
      if (NONE.has(name)) expect(deep).toEqual([]);
      // The rule reads a round thing's box: its centre and radius give it here.
      const boxed = (spot: Seen) => ({
        ...spot,
        left: spot.x - spot.radius,
        right: spot.x + spot.radius,
        top: spot.y - spot.radius,
        bottom: spot.y + spot.radius,
      });
      const all = [...spots, ...bodies.map(({ seen }) => seen)].map(boxed);
      const frame = { deep: view.close !== undefined, lights: [see({ x: 0, y: 0, z: 0 })], ...REST_SCREENS[0] };
      if (!NONE.has(name)) expect(composed(all, boxed(earth), frame)).toBe(true);
    },
  );

  it("gives the same set the same depth, in any order of its file", () => {
    const file = sets["300 systems of four"];
    const { systems, view } = made(file);
    const again = systemsOf([...file].reverse());
    const ids = (list: readonly StarSystem[], deep: ReturnType<typeof deepBodies>) =>
      deep.map(({ system, world }) => list[system]?.worlds[world]?.id);
    expect(ids(again, deepBodies(again, restView(again)))).toEqual(ids(systems, deepBodies(systems, view)));
  });
});

// Alexis, 2026-11-03 ("roches d'ambiance", through the chief): at the home's view at rest, a few rocks in front of everything, decor and not
// worlds, from the view's own seed; larger and soft when near, sliding with the eye; never over the Earth's disc or a label.
describe("the home's rocks (7p)", () => {
  const sets = {
    "100 systems": files["100 systems"],
    "1,000 systems": files["1,000 systems"],
    "300 systems of four": files["300 systems of four"],
    "54 of four": spread(54, 4),
    "rich mix": richMix(),
  } as const satisfies Record<string, readonly WorldHeld[]>;
  const rows = Object.keys(sets) as (keyof typeof sets)[];
  const rocksFor = (name: keyof typeof sets) => {
    const { systems, view } = made(sets[name]);
    const framed = judgeOf(systems, view, LENT);
    deepOf(systems, view, framed);
    return { systems, view, framed, rocks: rocksOf(view, framed) };
  };

  // The close world passes nearer still: a rock may stand behind it, never on it.
  it.each(rows)(
    "lays three to seven, each nearer the eye than the Earth and every body but the close world, with %s",
    (name) => {
      const { systems, view, framed, rocks } = rocksFor(name);
      expect(rocks.length).toBeGreaterThanOrEqual(3);
      expect(rocks.length).toBeLessThanOrEqual(7);
      const see = cameraOf(view, REST_SCREENS[0]);
      const [close, closeSystem] = [closeOf(systems, view), systems[view.close?.system ?? -1]];
      const closeAway =
        close === undefined || closeSystem === undefined ? Infinity : see(placeOf(closeSystem, close, 0)).away;
      const aways = framed.spots.map(({ away }) => away).filter((away) => Math.abs(away - closeAway) > 1e-6);
      const nearest = Math.min(see(EARTH_PLACE).away, ...aways);
      for (const { place, radius } of rocks) expect(see(place).away + radius).toBeLessThan(nearest);
    },
  );

  // A label stands where core's layout may stand it (settle.ts's PLACE): its stem 12 pixels in from either end of a pill up to 200 wide and
  // 32 high, held over the body's centre, 22 off its outline, above or below. Swayed, the near rocks slide the most.
  it.each(rows)(
    "stands none over the Earth, a body or its label's room, the hero or the star's heart, at rest and swayed, with %s",
    (name) => {
      const { view, framed, rocks } = rocksFor(name);
      expect(rocks.length).toBeGreaterThan(0);
      const [pill, high] = [200, 32];
      const roomOf = (rock: Seen, body: { x: number; y: number; radius: number }) =>
        overlaps(rock, body, body.radius) ||
        (Math.abs(rock.x - body.x) < pill - PLACE.stem + rock.radius &&
          Math.abs(rock.y - body.y) < body.radius + PLACE.gap + high + rock.radius);
      for (const [{ width, height }, swayed] of SCREENS_SWAYED) {
        const see = cameraOf(view, { width, height }, swayed);
        const earth = see(EARTH_PLACE, EARTH_RADIUS);
        const star = see({ x: 0, y: 0, z: 0 });
        for (const { place, radius } of rocks) {
          const rock = see(place, radius);
          expect(roomOf(rock, earth)).toBe(false);
          expect(inHero(rock, width, height)).toBe(false);
          expect(overlaps(rock, star, STAR_HEART)).toBe(false);
        }
      }
      const see = cameraOf(view, REST_SCREENS[0]);
      for (const { place, radius } of rocks)
        for (const body of framed.spots) expect(roomOf(see(place, radius), body)).toBe(false);
    },
  );

  // The design review of 7p (D3): nothing read in front, the rocks a sprinkle no larger than the far worlds. One near rock, larger than the
  // middle worlds, cut by the frame's left edge above the hero or its bottom edge right of it (the references); the others whole pebbles.
  it.each(rows)(
    "draws one near, 30 to 60 pixels, cut by the frame's edge, the others whole and smaller, none on another, in no row, with %s",
    (name) => {
      const { view, rocks } = rocksFor(name);
      const { width, height } = REST_SCREENS[0];
      const see = cameraOf(view, REST_SCREENS[0]);
      const spots = rocks.map(({ place, radius }) => see(place, radius)).sort((a, b) => a.away - b.away);
      const radii = spots.map(({ radius }) => radius);
      const [near, ...others] = spots;
      if (near === undefined) throw new Error("no rock");
      expect(near.radius).toBeGreaterThanOrEqual(30 - 1e-9);
      expect(near.radius).toBeLessThanOrEqual(60 + 1e-9);
      expect(near.x - near.radius < 0 || near.y + near.radius > height).toBe(true);
      expect(near.x + near.radius < width && near.y - near.radius > 0).toBe(true);
      for (const spot of others) {
        expect(whole(spot, width, height)).toBe(true);
        expect(spot.radius).toBeGreaterThanOrEqual(2.5 - 1e-9);
        expect(spot.radius).toBeLessThanOrEqual(15 + 1e-9);
      }
      expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThanOrEqual(2);
      const third = Math.ceil(spots.length / 3);
      expect(Math.max(...radii.slice(0, third))).toBeGreaterThan(Math.max(...radii.slice(spots.length - third)));
      spots.forEach((one, at) => {
        for (const other of spots.slice(at + 1)) expect(overlaps(one, other, other.radius)).toBe(false);
      });
      expect(evenRow(spots)).toBe(false);
    },
  );

  // The design review of 7p (D3): f0004's debris stands as a cluster of three or four, not a sprinkle: the pebbles lie round one place, no
  // two of them more than 200 pixels apart.
  it.each(rows)("lays the pebbles as one cluster round one place, with %s", (name) => {
    const { view, rocks } = rocksFor(name);
    const see = cameraOf(view, REST_SCREENS[0]);
    const [, ...pebbles] = rocks.map(({ place, radius }) => see(place, radius)).sort((a, b) => a.away - b.away);
    expect(pebbles.length).toBeGreaterThanOrEqual(2);
    pebbles.forEach((one, at) => {
      for (const other of pebbles.slice(at + 1))
        expect(Math.hypot(one.x - other.x, one.y - other.y)).toBeLessThanOrEqual(200);
    });
  });

  // Seeded by the view: an eye a thousandth of a unit away sees nearly the same frame, and other rocks.
  it("lays the same rocks for the same view, and others for another eye", () => {
    const { systems, view, rocks } = rocksFor("100 systems");
    expect(rocksFor("100 systems").rocks).toEqual(rocks);
    const moved = { ...view, eye: { ...view.eye, x: view.eye.x + 1e-3 } };
    const judge = judgeOf(systems, moved, LENT);
    deepOf(systems, moved, judge);
    const see = cameraOf(view, REST_SCREENS[0]);
    const places = (list: typeof rocks) =>
      list.map(({ place }) => see(place)).map(({ x, y }) => `${x.toFixed(0)} ${y.toFixed(0)}`);
    expect(places(rocksOf(moved, judge))).not.toEqual(places(rocks));
  });
});

describe("what the drawn bodies leave clear", () => {
  it.each(Object.entries(files))(
    "covers neither the Earth from in front, nor the great star's heart, nor the hero, at any phase, with %s",
    (_, file) => {
      const { systems, view } = made(file);
      const earthAway = Math.hypot(...Object.values(minus(view.eye, EARTH_PLACE)));
      for (const [{ width, height }, swayed] of SCREENS_SWAYED) {
        const see = cameraOf(view, { width, height }, swayed);
        const earth = see(EARTH_PLACE, EARTH_RADIUS);
        const star = see({ x: 0, y: 0, z: 0 });
        // The close world holds its place at rest: the scene stops its turn.
        const places = drawn(systems, view).flatMap(({ system, world }) =>
          (world === closeOf(systems, view) ? [0] : phases(system)).map((seconds) =>
            see(placeOf(system, world, seconds), world.radius),
          ),
        );
        for (const seen of places.filter(({ depth }) => depth > 0)) {
          expect(seen.away < earthAway && overlaps(seen, earth, earth.radius)).toBe(false);
          expect(overlaps(seen, star, STAR_HEART)).toBe(false);
          expect(inHero(seen, width, height)).toBe(false);
        }
      }
    },
  );

  it.each(Object.entries(files))(
    "crowds no group denser than frame 4's in any box, the Earth among them, with %s",
    (_, file) => {
      const { systems, view } = made(file);
      for (const { width, height } of REST_SCREENS) {
        const see = cameraOf(view, { width, height });
        const spots = [
          see(EARTH_PLACE, EARTH_RADIUS),
          ...drawn(systems, view).map(({ system, world }) => see(placeOf(system, world, 0), world.radius)),
        ].filter((spot) => !offScreen(spot, width, height));
        // Frame 4's densest group: four bodies in about 200 by 120 pixels, measured by the chief at 1728 by 1080. Every box that holds a
        // different set has a body's centre on its left edge and one on its top edge.
        for (const left of spots)
          for (const top of spots) {
            const inBox = spots.filter(
              ({ x, y }) => x >= left.x && x <= left.x + 200 && y >= top.y && y <= top.y + 120,
            );
            expect(inBox.length).toBeLessThanOrEqual(4);
          }
      }
    },
  );

  // The chief, 2026-11-02, on the postcards clumped round their star: frame 4's groups have air between their bodies, about four tenths of
  // the smaller one's width at the least (Creators' pair 0.64, the Earth and its neighbour left 0.43, Dev help's pair 0.41).
  const timesOf = (systems: readonly StarSystem[], view: RestView) => {
    const spins = view.postcards.map((index) => Math.abs(systems[index]?.spin ?? 1));
    const longest = (2 * Math.PI) / Math.min(...spins, 1);
    return Array.from({ length: 96 }, (_, step) => (step * longest) / 96);
  };
  // Every pair of bodies on screen, the Earth among them, at each time of the turns, at rest and swayed, the nearer first.
  const pairsOf = (systems: readonly StarSystem[], view: RestView) => {
    const close = closeOf(systems, view);
    return timesOf(systems, view).flatMap((seconds) =>
      SCREENS_SWAYED.flatMap(([{ width, height }, swayed]) => {
        const see = cameraOf(view, { width, height }, swayed);
        const spots = [
          see(EARTH_PLACE, EARTH_RADIUS),
          ...drawn(systems, view).map(({ system, world }) =>
            see(placeOf(system, world, world === close ? 0 : seconds), world.radius),
          ),
        ].filter((spot) => !offScreen(spot, width, height));
        return spots.flatMap((one, at) =>
          spots
            .slice(at + 1)
            .map((other): readonly [Seen, Seen] => (one.away <= other.away ? [one, other] : [other, one])),
        );
      }),
    );
  };
  // The chief, 2026-11-02, after Alexis: a near world partly covering a far one is depth; two at a like distance never touch.
  it.each(Object.entries(files))(
    "keeps a third of the smaller one's width between two bodies at a like distance, within 1.5 times, the Earth among them, with %s",
    (_, file) => {
      const { systems, view } = made(file);
      const pairs = pairsOf(systems, view);
      expect(pairs.length).toBeGreaterThan(0);
      for (const [near, far] of pairs)
        if (far.away / near.away < 1.5)
          expect(Math.hypot(near.x - far.x, near.y - far.y) - near.radius - far.radius).toBeGreaterThanOrEqual(
            (2 / 3) * Math.min(near.radius, far.radius),
          );
    },
  );

  it.each(Object.entries(files))(
    "lets a body 1.5 times nearer or more cover a farther one by half at most, the Earth among them, with %s",
    (_, file) => {
      const { systems, view } = made(file);
      const pairs = pairsOf(systems, view);
      expect(pairs.length).toBeGreaterThan(0);
      for (const [near, far] of pairs)
        if (far.away / near.away >= 1.5) expect(coveredShare(near, far)).toBeLessThanOrEqual(0.5);
    },
  );

  it.each(Object.entries(files))(
    "leaves between two bodies of a postcard a third of the smaller one's width, at any time, with %s",
    (_, file) => {
      const { systems, view } = made(file);
      for (const index of view.postcards) {
        const system = systems[index];
        if (system === undefined) throw new Error("no postcard");
        const postcard = postcardOf(system, view.eye);
        expect(postcard.worlds.length).toBeGreaterThan(0);
        for (const seconds of phases(system))
          for (const { width, height } of REST_SCREENS) {
            const see = cameraOf(view, { width, height });
            const spots = postcard.worlds.map((world) => see(placeOf(postcard.system, world, seconds), world.radius));
            spots.forEach((one, at) => {
              for (const other of spots.slice(at + 1))
                expect(Math.hypot(one.x - other.x, one.y - other.y) - one.radius - other.radius).toBeGreaterThanOrEqual(
                  (2 / 3) * Math.min(one.radius, other.radius),
                );
            });
          }
      }
    },
  );

  it.each(Object.entries(files))(
    "keeps a postcard's worlds in its own cell, round its own star, with %s",
    (_, file) => {
      const { systems, view } = made(file);
      for (const index of view.postcards) {
        const system = systems[index];
        if (system === undefined) throw new Error("no postcard");
        const postcard = postcardOf(system, view.eye);
        for (const world of postcard.worlds) {
          const at = placeOf(postcard.system, world, 0);
          expect(Math.hypot(...Object.values(minus(at, system.place))) + world.radius).toBeLessThanOrEqual(
            CELL / 2 + 1e-9,
          );
        }
      }
    },
  );

  it("stands every body nearer its own star than any other, at 100, 1,000 and 10,000 systems, crowds and a namespace of 20,000", () => {
    for (const file of [
      files["100 systems"],
      files["1,000 systems"],
      files["10,000 systems"],
      files["crowds and singles"],
      files["one namespace of 20,000"],
    ]) {
      const { systems, view } = made(file);
      for (const { system, world } of drawn(systems, view)) {
        // Only a system within a few cells could be nearer: the others stand a cell from this one at least.
        const around = systems.filter(
          (other) => other.id !== system.id && Math.hypot(...Object.values(minus(other.place, system.place))) < 60,
        );
        const places = phases(system).map((seconds) => placeOf(system, world, seconds));
        const nearest = places.map((at) =>
          Math.min(...around.map((other) => Math.hypot(...Object.values(minus(at, other.place))))),
        );
        places.forEach((at, step) => {
          expect(nearest[step]).toBeGreaterThan(Math.hypot(...Object.values(minus(at, system.place))));
        });
      }
    }
  });

  it("reads in depth with a close world: sizes on screen four times apart or more, distances to the eye two and a half times", () => {
    for (const file of [files["1,000 systems"], files["300 systems of four"], files["one namespace of 20,000"]]) {
      const { systems, view } = made(file);
      const [{ width, height }] = REST_SCREENS;
      const see = cameraOf(view, { width, height });
      const seen = [
        see(EARTH_PLACE, EARTH_RADIUS),
        ...drawn(systems, view).map(({ system, world }) => see(placeOf(system, world, 0), world.radius)),
      ].filter((spot) => !offScreen(spot, width, height));
      const sizes = seen.map(({ radius }) => radius);
      const distances = seen.map(({ away }) => away);
      expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThanOrEqual(4);
      expect(Math.max(...distances) / Math.min(...distances)).toBeGreaterThanOrEqual(2.5);
    }
  });

  // What stands on the screen (the centres on it, the great star and the postcards' stars, which glow) fits no line, unless its bodies
  // recede, their sizes falling twice or more from the nearest to the farthest (the chief, 2026-11-02, after Alexis's references): a
  // tenth across a line with a close world, a fifth without. The unlit set's view is the last resort, which takes what fits however it reads.
  it.each(Object.entries(files).filter(([name]) => !UNLIT.has(name)))(
    "reads in 3D through a whole turn: what stands on the screen is in no row that does not recede, with %s",
    (_, file) => {
      const { systems, view } = made(file);
      const close = closeOf(systems, view);
      // Sixteen instants of the longest postcard's turn (7d6's review: a row formed within a turn).
      const instants = timesOf(systems, view).filter((_, step) => step % 6 === 0);
      for (const [{ width, height }, seconds] of REST_SCREENS.flatMap((screen) =>
        instants.map((at) => [screen, at] as const),
      )) {
        const see = cameraOf(view, { width, height });
        const onScreen = ({ x, y }: Seen) => x >= 0 && x <= width && y >= 0 && y <= height;
        const bodies = [
          see(EARTH_PLACE, EARTH_RADIUS),
          ...drawn(systems, view).map(({ system, world }) =>
            see(placeOf(system, world, world === close ? 0 : seconds), world.radius),
          ),
        ].filter(onScreen);
        const stars = [{ x: 0, y: 0, z: 0 }, ...view.postcards.map((index) => systems[index]?.place ?? EARTH_PLACE)]
          .map((place) => see(place))
          .filter(onScreen);
        const marks = [...bodies, ...stars];
        expect(marks.length).toBeGreaterThan(0);
        if (marks.length < 3) continue;
        const mean = {
          x: marks.reduce((sum, { x }) => sum + x, 0) / marks.length,
          y: marks.reduce((sum, { y }) => sum + y, 0) / marks.length,
        };
        const [xx, xy, yy] = marks.reduce(
          ([a, b, c], { x, y }) => [a + (x - mean.x) ** 2, b + (x - mean.x) * (y - mean.y), c + (y - mean.y) ** 2],
          [0, 0, 0],
        );
        const [middle, reach] = [(xx + yy) / 2, Math.sqrt(((xx - yy) / 2) ** 2 + xy ** 2)];
        if (Math.sqrt((middle - reach) / (middle + reach)) > (view.close === undefined ? 0.2 : 0.1)) continue;
        const byAway = [...bodies].sort((a, b) => a.away - b.away);
        expect((byAway[0]?.radius ?? 0) / (byAway.at(-1)?.radius ?? Infinity)).toBeGreaterThanOrEqual(2);
      }
    },
  );
});

// The chief, 2026-11-03 (Alexis's not-a-planetarium rule): through the home's lens Onyx's dive stood the Earth and two bodies on a line at
// like gaps for 1.3 s. The way down to every set's view, at 60 frames a second, stands no three of its drawn bodies, the Earth among them,
// on a line at like gaps for longer than a tenth of a second (six frames).
describe("the way down", () => {
  it.each(Object.entries(files))("stands no row at like gaps longer than a tenth of a second, with %s", (_, file) => {
    const { systems, view } = made(file);
    const bodies = drawn(systems, view);
    const close = closeOf(systems, view);
    const frames = Math.round(DIVE.seconds * 60);
    let [run, longest] = [0, 0];
    for (let frame = 1; frame < frames; frame += 1) {
      const eye = { x: NaN, y: NaN, z: NaN };
      diveAt(view.eye, frame / frames, eye);
      const row = REST_SCREENS.some((screen) => {
        const see = cameraOf({ ...view, eye }, screen);
        const onScreen = ({ x, y, radius }: Seen) =>
          x + radius > 0 && x - radius < screen.width && y + radius > 0 && y - radius < screen.height;
        const seen = bodies
          .map(({ system, world }) =>
            see(placeOf(system, world, world === close ? 0 : orbitTime(frame / 60)), world.radius),
          )
          .filter((at) => at.depth > 0 && at.radius >= BODY_PIXELS && onScreen(at));
        return evenRow([see(EARTH_PLACE, EARTH_RADIUS), ...seen]);
      });
      run = row ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThanOrEqual(6);
  });
});

describe("the close world", () => {
  it.each(["1,000 systems", "300 systems of four", "one namespace of 20,000"] as const)("is found with %s", (name) => {
    expect(made(files[name]).view.close).toBeDefined();
  });

  // Every set that has one: Onyx's own is held by the scene's test.
  const withClose = () =>
    Object.values(files)
      .map((file) => made(file))
      .filter(({ view }) => view.close !== undefined);

  it("stands close to the eye, twice the Earth's size or more, cut by the left or right edge of both screens, at rest and swayed", () => {
    expect(withClose().length).toBeGreaterThanOrEqual(3);
    for (const { systems, view } of withClose()) {
      if (view.close === undefined) continue;
      const system = systems[view.close.system];
      const world = system?.worlds[view.close.world];
      if (system === undefined || world === undefined) throw new Error("no close world");
      expect(world.radius).toBeGreaterThanOrEqual(GRAIN);
      expect(view.postcards).not.toContain(view.close.system);
      for (const [{ width, height }, swayed] of SCREENS_SWAYED) {
        const see = cameraOf(view, { width, height }, swayed);
        const centre = placeOf(system, world, 0);
        const seen = see(centre, world.radius);
        const earth = see(EARTH_PLACE, EARTH_RADIUS);
        expect(seen.depth).toBeGreaterThan(world.radius);
        expect(seen.radius).toBeGreaterThanOrEqual(2 * earth.radius);
        // Its true outline on the screen, off the view's axis wider outward than a circle (7d6's review, lot 2).
        const { left, right, top, bottom } = outline(see, centre, world.radius);
        expect([left < 0, right > width].filter(Boolean)).toHaveLength(1);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(bottom).toBeLessThanOrEqual(height);
        expect(Math.min(right, width) - Math.max(left, 0)).toBeGreaterThanOrEqual(0.25 * (right - left));
      }
    }
  });

  // Seen on Onyx's file (7d6): a postcard world stood whole behind the close world, hidden by it.
  it("hides no postcard world behind it, at any phase, at rest and swayed", () => {
    for (const { systems, view } of withClose()) {
      const world = closeOf(systems, view);
      const system = systems[view.close?.system ?? -1];
      if (system === undefined || world === undefined) throw new Error("no close world");
      const turning = view.postcards.flatMap((index) => {
        const postcard = systems[index];
        return (postcard === undefined ? [] : shownOf(postcard, view)).flatMap(({ system: plane, world: body }) =>
          phases(plane).map((seconds) => ({ at: placeOf(plane, body, seconds), radius: body.radius })),
        );
      });
      for (const [{ width, height }, swayed] of SCREENS_SWAYED) {
        const see = cameraOf(view, { width, height }, swayed);
        const close = see(placeOf(system, world, 0), world.radius);
        for (const { at, radius } of turning) expect(overlaps(see(at, radius), close, close.radius)).toBe(false);
      }
    }
  });

  it("leaves the rest of its system off screen, its star too", () => {
    for (const { systems, view } of withClose()) {
      if (view.close === undefined) continue;
      const system = systems[view.close.system];
      if (system === undefined) throw new Error("no close system");
      for (const { width, height } of REST_SCREENS) {
        const see = cameraOf(view, { width, height });
        expect(offScreen(see(system.place), width, height)).toBe(true);
        system.worlds.forEach((world, index) => {
          if (index !== view.close?.world && world.radius >= GRAIN)
            expect(offScreen(see(placeOf(system, world, 0), world.radius), width, height)).toBe(true);
        });
      }
    }
  });
});

// The chief, 2026-11-03 (7v): the home's view at rest is the Earth's dynamic view, the projects the team adds by hand small bodies by the
// Earth. Turning, gnosh.ai made a row at like gaps with gnoslinger and agents in Onyx's view: each stands still, at the first twelfth of a
// turn from its own place that the view's judge finds clear, and stands in that judge before the depth's worlds are chosen.
describe("the Earth's projects at rest (7v)", () => {
  const sets = {
    "100 systems": files["100 systems"],
    "1,000 systems": files["1,000 systems"],
    "300 systems of four": files["300 systems of four"],
    "crowds and singles": files["crowds and singles"],
    "rich mix": richMix(),
  } as const satisfies Record<string, readonly WorldHeld[]>;
  const rows = Object.keys(sets) as (keyof typeof sets)[];
  const projects = Array.from({ length: 12 }, (_, at) => ({ name: `p${String(at)}` }));
  const STEP = (2 * Math.PI) / 12;
  // The view's own marks on a screen through `see`: the Earth, the close world held still, the postcards' bodies at their share.
  const ownOf = (
    { systems, view }: { systems: readonly StarSystem[]; view: RestView },
    see: ReturnType<typeof cameraOf>,
    seconds: number,
  ) => {
    const close = closeOf(systems, view);
    const closeSystem = systems[view.close?.system ?? -1];
    return [
      see(EARTH_PLACE, EARTH_RADIUS),
      ...view.postcards.flatMap((index) => {
        const system = systems[index];
        const card = system === undefined ? undefined : postcardOf(system, view.eye);
        return card === undefined
          ? []
          : card.worlds.map((world, at) =>
              see(placeOf(card.system, world, seconds), world.radius * (card.depth[at] ?? NaN)),
            );
      }),
      ...(close === undefined || closeSystem === undefined ? [] : [see(placeOf(closeSystem, close, 0), close.radius)]),
    ];
  };
  const boxed = (spots: readonly Seen[]) =>
    spots.map((spot) => ({
      ...spot,
      left: spot.x - spot.radius,
      right: spot.x + spot.radius,
      top: spot.y - spot.radius,
      bottom: spot.y + spot.radius,
    }));

  it.each(rows)(
    "stands each still, at its own orbit and size, a twelfth of a turn from its own a step, with %s",
    (name) => {
      const { systems, view } = made(sets[name]);
      const own = earthSystemOf(projects);
      const placed = projectsOf(judgeOf(systems, view, LENT), own);
      expect(placed.spin).toBe(0);
      expect(placed.place).toEqual(EARTH_PLACE);
      expect(placed.worlds.length).toBeGreaterThan(0);
      const ids = new Set(placed.worlds.map(({ id }) => id));
      expect(placed.worlds.map(({ id }) => id)).toEqual(own.worlds.map(({ id }) => id).filter((id) => ids.has(id)));
      for (const world of placed.worlds) {
        const mine = own.worlds.find(({ id }) => id === world.id);
        expect({ orbit: world.orbit, radius: world.radius }).toEqual({ orbit: mine?.orbit, radius: mine?.radius });
        const steps = (world.phase - (mine?.phase ?? NaN)) / STEP;
        expect(steps).toBeCloseTo(Math.round(steps), 9);
        expect(Math.round(steps)).toBeGreaterThanOrEqual(0);
        expect(Math.round(steps)).toBeLessThan(12);
      }
    },
  );

  it.each(rows)(
    "crowds, piles and lines up nothing the view did not, at rest and on every frame of the way down, with %s",
    (name) => {
      const { systems, view } = made(sets[name]);
      const placed = projectsOf(judgeOf(systems, view, LENT), earthSystemOf(projects));
      const shown = (spots: readonly Seen[]) => spots.filter(({ radius, depth }) => depth > 0 && radius >= BODY_PIXELS);
      const see = cameraOf(view, REST_SCREENS[0]);
      const own = ownOf({ systems, view }, see, 0);
      const added = placed.worlds.map((world) => see(placeOf(placed, world, 0), world.radius));
      const frame = { deep: view.close !== undefined, lights: [see({ x: 0, y: 0, z: 0 })], ...REST_SCREENS[0] };
      const [earth, ...rest] = boxed(own);
      if (earth === undefined) throw new Error("no Earth");
      if (composed(rest, earth, frame)) expect(composed([...rest, ...boxed(added)], earth, frame)).toBe(true);
      const out = { x: NaN, y: NaN, z: NaN };
      for (let step = 1; step < DIVE.seconds * 60; step += 1) {
        diveAt(view.eye, step / (DIVE.seconds * 60), out);
        const down = cameraOf({ ...view, eye: { ...out } }, REST_SCREENS[0]);
        const mine = shown(ownOf({ systems, view }, down, orbitTime(step / 60)));
        const theirs = shown(placed.worlds.map((world) => down(placeOf(placed, world, 0), world.radius)));
        if (evenRow(boxed([...mine, ...theirs]))) expect(evenRow(boxed(mine))).toBe(true);
      }
    },
  );

  it("stands each in the judge as it is placed, so the depth's worlds and the rocks keep off it", () => {
    const { systems, view } = made(sets["rich mix"]);
    const judge = judgeOf(systems, view, LENT);
    const [cards, spots] = [judge.cards.length, judge.spots.length];
    const placed = projectsOf(judge, earthSystemOf(projects));
    expect(judge.cards.slice(cards).flatMap(({ worlds }) => worlds)).toEqual(placed.worlds);
    expect(judge.cards.slice(cards).every(({ system }) => system.id === "earth" && system.spin === 0)).toBe(true);
    expect(judge.spots.length).toBe(spots + placed.worlds.length);
  });

  // The first clear place, not any (7v's review): gnosh.ai alone stands clear at its own in these two views, so it is kept there.
  it.each(["1,000 systems", "300 systems of four"] as const)(
    "keeps a project at its own place where it stands clear, with %s",
    (name) => {
      const { systems, view } = made(sets[name]);
      const own = earthSystemOf([{ name: "gnosh.ai" }]);
      expect(projectsOf(judgeOf(systems, view, LENT), own).worlds).toEqual(own.worlds);
    },
  );

  it("stands none where no screen is composed, and none of a file of none", () => {
    const { systems, view } = made(sets["rich mix"]);
    const judge = judgeOf(systems, view, LENT);
    expect(projectsOf({ ...judge, looks: [] }, earthSystemOf(projects)).worlds).toEqual([]);
    expect(projectsOf(judge, earthSystemOf([])).worlds).toEqual([]);
  });
});
