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
import { coveredShare, evenRow } from "./composition.ts";
import { DIVE, diveAt } from "./dive.ts";
import { BODY_PIXELS } from "../lod/ladder.ts";
import { postcardOf } from "./postcard.ts";
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
