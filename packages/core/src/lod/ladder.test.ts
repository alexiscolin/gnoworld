import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { systemsOf, toMap, type StarSystem, type WorldHeld } from "../cosmos/system.ts";
import { textHash, type Point } from "../space/cell.ts";
import { HOME } from "../space/drift.ts";
import { BOUNDS, dotLight, Drawn, HAZE, Ladder, LANDMARKS, MIDDLE, onScreen, screenRadius } from "./ladder.ts";
import { clearOf, GROWTH, growthAt, leanFor, SPREAD, spreadAt } from "./screen.ts";

// The ladder of detail (ADR-0002 §3): what is drawn depends on the distance alone, never on the universe's size. From close to far a world
// is a body, a point, then part of its star; a star a star, then part of a region's one glow, and past the haze nothing.
const FOCAL = 1158;
const universe = (systems: number, each = 5): StarSystem[] => {
  const worlds: WorldHeld[] = [];
  for (let at = 0; at < systems; at += 1)
    for (let world = 0; world < 1 + (textHash(String(at)) % (2 * each)); world += 1)
      worlds.push({ id: `n${String(at)}/w${String(world)}`, namespace: `n${String(at)}`, use: world });
  return systemsOf(worlds);
};
const arrival = () => {
  const eye = { x: NaN, y: NaN, z: NaN };
  toMap(HOME, eye);
  return eye;
};
const viewOf = (eye: Point, focal = FOCAL, focus = eye) => ({ eye, focal, focus });
const look = (ladder: Ladder, eye: { x: number; y: number; z: number }) => {
  const drawn = new Drawn();
  ladder.look(viewOf(eye), drawn);
  return drawn;
};
const SIZES = [100, 1000, 10_000];
const made = new Map<number, StarSystem[]>();
const sized = (count: number) => {
  const known = made.get(count) ?? universe(count);
  made.set(count, known);
  return known;
};
const counts = (drawn: Drawn) => ({
  bodies: drawn.bodyCount,
  stars: drawn.starCount,
  dots: drawn.dotCount,
  glows: drawn.glowCount,
});
const within = (drawn: Drawn) => {
  expect(drawn.bodyCount).toBeLessThanOrEqual(BOUNDS.bodies);
  expect(drawn.starCount).toBeLessThanOrEqual(BOUNDS.stars);
  expect(drawn.dotCount).toBeLessThanOrEqual(BOUNDS.dots);
  expect(drawn.glowCount).toBeLessThanOrEqual(BOUNDS.glows);
};
const pick = (list: readonly StarSystem[], at: number): StarSystem => {
  const found = list[at];
  if (found === undefined) throw new Error("no such system");
  return found;
};
const distanceTo = (system: StarSystem, eye: { x: number; y: number; z: number }) =>
  Math.hypot(system.place.x - eye.x, system.place.y - eye.y, system.place.z - eye.z);
const bodiesOf = (drawn: Drawn) =>
  Array.from({ length: drawn.bodyCount }, (_, at) => ({
    system: drawn.bodySystems[at] ?? -1,
    world: drawn.bodyWorlds[at] ?? -1,
  }));

// A crowd no map makes: `count` systems a step apart, each holding `worlds`, so every cap must bind.
const crowd = (count: number, worlds: number, step = 3): StarSystem[] => {
  const side = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, at) => ({
    id: `c${String(at)}`,
    place: { x: (at % side) * step, y: 0, z: Math.floor(at / side) * step },
    star: 1,
    warmth: 0.5,
    spin: 0.1,
    belt: false,
    worlds: Array.from({ length: worlds }, (__, world) => ({
      id: `c${String(at)}/${String(world)}`,
      radius: 1,
      orbit: 2,
      phase: 0,
    })),
  }));
};

describe("the draw bound", () => {
  it("is the budget this part records", () => {
    expect(BOUNDS).toEqual({ bodies: 40, stars: 1024, dots: 4096, glows: 256, rocks: 480 });
  });

  it.each(SIZES)("holds at %i systems, from the arrival and from beside any system of them", (size) => {
    const list = sized(size);
    const ladder = new Ladder(list);
    const seen = counts(look(ladder, arrival()));
    within(look(ladder, arrival()));
    expect(seen.bodies).toBeGreaterThan(0);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: size - 1 }), fc.double({ min: 5, max: 600, noNaN: true }), (at, height) => {
        const { place } = pick(list, at);
        const drawn = look(ladder, { x: place.x, y: place.y + height, z: place.z });
        within(drawn);
        expect(drawn.starCount + drawn.glowCount).toBeGreaterThan(0);
      }),
      { numRuns: 25 },
    );
  });

  it("binds each cap on a crowd no map makes, and draws the nearest", () => {
    const list = crowd(4000, 20);
    const ladder = new Ladder(list);
    const eye = { x: 90, y: 20, z: 90 };
    const drawn = look(ladder, eye);
    expect(drawn.bodyCount).toBe(BOUNDS.bodies);
    expect(drawn.starCount).toBe(BOUNDS.stars);
    expect(drawn.dotCount).toBe(BOUNDS.dots);
    const least = Math.min(...list.map((system) => distanceTo(system, eye)));
    expect(distanceTo(pick(list, drawn.bodySystems[0] ?? -1), eye)).toBeCloseTo(least, 9);
  });

  it("holds the glows' cap over regions no map makes", () => {
    const drawn = look(new Ladder(crowd(160_000, 0, 60)), { x: 12_000, y: 100, z: 12_000 });
    expect(drawn.glowCount).toBe(BOUNDS.glows);
  });

  it("draws the same from the arrival at 1,000 and at 10,000 systems, for what is near is the same", () => {
    const [small, large] = [1000, 10_000].map((size) => counts(look(new Ladder(sized(size)), arrival())));
    expect(large?.bodies).toBe(BOUNDS.bodies);
    expect(small?.bodies).toBe(BOUNDS.bodies);
    expect(large?.stars).toBeLessThanOrEqual((small?.stars ?? 0) * 1.25);
    expect(large?.stars).toBeGreaterThanOrEqual((small?.stars ?? 0) * 0.75);
  });

  it("holds its counts past the cap: 100,000 systems draw what 10,000 do, not ten times it", () => {
    const huge = universe(100_000, 1);
    const eye = { x: 200, y: 60, z: 200 };
    const large = counts(look(new Ladder(universe(10_000, 1)), eye));
    const most = counts(look(new Ladder(huge), eye));
    expect(large.stars).toBeGreaterThan(100);
    expect(most.stars).toBeLessThanOrEqual(large.stars * 1.3);
    expect(most.bodies).toBeLessThanOrEqual(BOUNDS.bodies);
    expect(most.glows).toBeLessThanOrEqual(BOUNDS.glows);
  });

  it("asks a look about what is around the eye, never the whole universe", () => {
    const eye = { x: 100, y: 60, z: 100 };
    const [large, huge] = [new Ladder(universe(10_000, 1)), new Ladder(universe(100_000, 1))];
    look(large, eye);
    look(huge, eye);
    expect(large.visited).toBeGreaterThan(0);
    expect(huge.visited).toBeLessThanOrEqual(large.visited * 1.3);
    expect(huge.visited).toBeLessThan(5000);
  });

  it("holds beside one namespace of 20,000 worlds: the size of a system moves no bound", () => {
    const worlds = Array.from({ length: 20_000 }, (_, at) => ({ id: `big/${String(at)}`, namespace: "big", use: 1 }));
    const list = systemsOf(worlds);
    const big = list.find(({ id }) => id === "big");
    if (big === undefined) throw new Error("no such system");
    const ladder = new Ladder(list);
    const drawn = look(ladder, { x: big.place.x, y: big.place.y + 14, z: big.place.z });
    within(drawn);
    expect(ladder.visited).toBeLessThan(10);
  });

  it("stays whole with the eye on a star: no distance divides by nothing", () => {
    const list = sized(100);
    const ladder = new Ladder(list);
    const { place } = pick(list, 3);
    const drawn = look(ladder, place);
    within(drawn);
    expect(drawn.starCount).toBeGreaterThan(0);
    expect(Number.isFinite(screenRadius(1, 0, FOCAL))).toBe(true);
    expect(Number.isFinite(onScreen(1, 0, FOCAL))).toBe(true);
  });

  it("is a pure function of the place: the same eye, the same list, in a reused record too", () => {
    const ladder = new Ladder(sized(1000));
    const reused = new Drawn();
    ladder.look(viewOf({ x: 900, y: 300, z: 900 }), reused);
    ladder.look(viewOf(arrival()), reused);
    const fresh = look(ladder, arrival());
    expect(bodiesOf(reused)).toEqual(bodiesOf(fresh));
    expect(counts(reused)).toEqual(counts(fresh));
    expect(reused.stars.slice(0, reused.starCount)).toEqual(fresh.stars.slice(0, fresh.starCount));
  });
});

describe("the rungs", () => {
  const systems = () => sized(1000);
  const eye = () => arrival();

  it("draws a star for each system in the middle distance, a glow for what is further, nothing past the haze", () => {
    const ladder = new Ladder(systems());
    const drawn = look(ladder, eye());
    const shown = new Set(drawn.stars.slice(0, drawn.starCount));
    systems().forEach((system, at) => {
      expect(shown.has(at)).toBe(distanceTo(system, eye()) <= MIDDLE);
    });
    expect(look(new Ladder(sized(10_000)), { x: 0, y: 700, z: 0 }).glowCount).toBeGreaterThan(0);
    const gone = look(ladder, { x: 100_000, y: 0, z: 0 });
    expect(counts(gone)).toEqual({ bodies: 0, stars: 0, dots: 0, glows: 0 });
    expect(look(ladder, { x: 0, y: HAZE * 2, z: 0 }).glowCount).toBe(0);
  });

  it("gives a region one glow, however many systems it holds", () => {
    const ladder = new Ladder(sized(10_000));
    const drawn = look(ladder, { x: 0, y: 900, z: 0 });
    expect(drawn.starCount).toBe(0);
    expect(drawn.glowCount).toBeGreaterThan(20);
    expect(drawn.glowCount).toBeLessThan(BOUNDS.glows);
    const regions = Array.from({ length: drawn.glowCount }, (_, at) => ladder.region(drawn.glows[at] ?? -1));
    expect(regions.reduce((sum, { systems: held }) => sum + held, 0)).toBeGreaterThan(5000);
  });

  it("draws one landmark a system first, nearest first, before any second world", () => {
    const list = systems();
    const ladder = new Ladder(list);
    const drawn = look(ladder, eye());
    const bodies = bodiesOf(drawn);
    expect(bodies.length).toBeGreaterThan(10);
    const firsts = bodies.filter(({ world }) => world === 0);
    const near = list.filter((system) => system.worlds.length > 0 && distanceTo(system, eye()) <= LANDMARKS).length;
    expect(firsts.length).toBe(Math.min(near, BOUNDS.bodies));
    const firstSecond = bodies.findIndex(({ world }) => world > 0);
    if (firstSecond !== -1) expect(firstSecond).toBe(firsts.length);
    const distances = firsts.map(({ system }) => distanceTo(pick(list, system), eye()));
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("gives what is left of the bound to the nearest systems' other worlds, so a close system shows them", () => {
    const list = universe(40);
    const ladder = new Ladder(list);
    const nearest = list.find((system) => system.worlds.length > 2);
    if (nearest === undefined) throw new Error("no such system");
    const here = { x: nearest.place.x + 3, y: nearest.place.y + 12, z: nearest.place.z };
    const bodies = bodiesOf(look(ladder, here));
    const at = list.indexOf(nearest);
    expect(bodies.filter(({ system }) => system === at).length).toBeGreaterThanOrEqual(3);
  });

  it("draws a world once: a body is no point", () => {
    const ladder = new Ladder(systems());
    const drawn = look(ladder, eye());
    const seen = new Set(bodiesOf(drawn).map(({ system, world }) => `${String(system)}/${String(world)}`));
    for (let at = 0; at < drawn.dotCount; at += 1)
      expect(seen.has(`${String(drawn.dotSystems[at])}/${String(drawn.dotWorlds[at])}`)).toBe(false);
    expect(seen.size).toBe(drawn.bodyCount);
  });

  it("stands the bodies around what the eye looks at, not around the eye", () => {
    const list = sized(1000);
    const ladder = new Ladder(list);
    const drawn = new Drawn();
    const focus = { x: 0, y: 0, z: 0 };
    ladder.look(viewOf({ x: 0, y: 60, z: 90 }, FOCAL, focus), drawn);
    expect(drawn.bodyCount).toBeGreaterThan(0);
    for (const { system } of bodiesOf(drawn))
      expect(distanceTo(pick(list, system), focus)).toBeLessThanOrEqual(LANDMARKS);
  });

  it("makes a point of a world too small on screen to be a body", () => {
    const list = universe(30);
    const here = { x: 0, y: LANDMARKS * 0.9, z: 0 };
    const ladder = new Ladder(list);
    expect(look(ladder, here).bodyCount).toBeGreaterThan(0);
    const drawn = new Drawn();
    ladder.look(viewOf(here, 40), drawn);
    expect(drawn.bodyCount).toBe(0);
    expect(drawn.dotCount).toBeGreaterThan(0);
  });
});

describe("no pile-up, at any zoom", () => {
  const SCREEN = { width: 1728, height: 1080 };
  const AREA = SCREEN.width * SCREEN.height;

  it("shrinks a body on screen as the eye leaves it, in proportion: no world keeps a size", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 2, noNaN: true }),
        fc.double({ min: 2, max: MIDDLE, noNaN: true }),
        (radius, distance) => {
          expect(screenRadius(radius, distance * 2, FOCAL)).toBeCloseTo(screenRadius(radius, distance, FOCAL) / 2, 9);
        },
      ),
    );
  });

  it("shrinks a point as the eye leaves it, down to a pixel and no floor above one: the mock-up's pile-up", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 2, noNaN: true }),
        fc.double({ min: 2, max: MIDDLE / 2, noNaN: true }),
        (radius, distance) => {
          const [near, far] = [onScreen(radius, distance, FOCAL), onScreen(radius, distance * 2, FOCAL)];
          expect(far).toBeLessThanOrEqual(near);
          if (near > 1) expect(far).toBeLessThan(near);
          expect(far).toBeLessThanOrEqual(Math.max(1, screenRadius(radius, distance * 2, FOCAL)));
        },
      ),
    );
    expect(onScreen(0.01, MIDDLE * 0.99, FOCAL)).toBeLessThanOrEqual(1);
    expect(onScreen(1, 40, FOCAL)).toBeCloseTo(screenRadius(1, 40, FOCAL), 9);
  });

  it("puts a point out before the ladder drops it, so nothing pops", () => {
    expect(dotLight(1)).toBe(1);
    expect(dotLight(MIDDLE * 0.5)).toBe(1);
    expect(dotLight(MIDDLE * 0.8)).toBeGreaterThan(0);
    expect(dotLight(MIDDLE * 0.8)).toBeLessThan(1);
    expect(dotLight(MIDDLE)).toBe(0);
    expect(dotLight(MIDDLE * 2)).toBe(0);
  });

  const covered = (list: readonly StarSystem[], drawn: Drawn, height: number) => {
    const inView = ({ place }: StarSystem) =>
      Math.abs((place.x * FOCAL) / height) < SCREEN.width / 2 &&
      Math.abs((place.z * FOCAL) / height) < SCREEN.height / 2;
    const area = (system: StarSystem, world: number, pixels: (radius: number) => number) =>
      inView(system) ? Math.PI * pixels(system.worlds[world]?.radius ?? 0) ** 2 : 0;
    const eye = { x: 0, y: height, z: 0 };
    const bodies = bodiesOf(drawn).map(({ system, world }) =>
      area(pick(list, system), world, (radius) => screenRadius(radius, height, FOCAL)),
    );
    const dots = Array.from({ length: drawn.dotCount }, (_, at) => {
      const system = pick(list, drawn.dotSystems[at] ?? -1);
      return area(system, drawn.dotWorlds[at] ?? -1, (radius) => onScreen(radius, distanceTo(system, eye), FOCAL));
    });
    return [...bodies, ...dots].reduce((sum, each) => sum + each, 0);
  };

  it("covers a small share of the screen from every height, at every size, seen straight down", () => {
    for (const size of SIZES)
      for (const height of [12, 30, 60, 120, 250, 500, 1000, 2000]) {
        const list = sized(size);
        const drawn = new Drawn();
        new Ladder(list).look(viewOf({ x: 0, y: height, z: 0 }, FOCAL, { x: 0, y: 0, z: 0 }), drawn);
        expect(covered(list, drawn, height) / AREA).toBeLessThan(0.2);
      }
  });

  it("leaves no two bodies one on the other, seen from straight above the map", () => {
    const list = sized(10_000);
    const ladder = new Ladder(list);
    for (const height of [20, 40, 80, 160]) {
      const eye = { x: 90, y: height, z: -70 };
      const drawn = new Drawn();
      ladder.look(viewOf(eye, FOCAL, { x: 90, y: 0, z: -70 }), drawn);
      const circles = bodiesOf(drawn).map(({ system, world }) => {
        const star = pick(list, system);
        const { orbit, phase, radius } = star.worlds[world] ?? { orbit: 0, phase: 0, radius: 0 };
        const scale = FOCAL / height;
        return {
          x: (star.place.x - eye.x + orbit * Math.cos(phase)) * scale,
          y: (star.place.z - eye.z + orbit * Math.sin(phase)) * scale,
          r: radius * scale,
        };
      });
      expect(circles.length).toBeGreaterThan(3);
      for (const [at, one] of circles.entries())
        for (const other of circles.slice(at + 1))
          expect(Math.hypot(one.x - other.x, one.y - other.y)).toBeGreaterThan(one.r + other.r);
    }
  });
});

describe("spreadAt: from afar a system opens, its true place kept (the chief's reading of f0004)", () => {
  it("leaves a system as it is, seen close", () => {
    expect(spreadAt(0)).toBe(1);
    expect(spreadAt(6)).toBe(1);
  });

  it("opens it wide from the arrival's distance on", () => {
    expect(spreadAt(36)).toBe(SPREAD);
    expect(spreadAt(5000)).toBe(SPREAD);
    expect(SPREAD).toBeGreaterThan(2);
  });

  it("opens by degrees, so a zoom never jumps", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 60, noNaN: true }), (distance) => {
        expect(spreadAt(distance + 0.01)).toBeGreaterThanOrEqual(spreadAt(distance));
        expect(spreadAt(distance + 0.01) - spreadAt(distance)).toBeLessThan(0.01);
      }),
    );
  });
});

describe("growthAt: the first plane reads large, as f0004's does", () => {
  it("leaves a body its true size up close, and grows it from afar, by degrees", () => {
    expect(growthAt(5)).toBe(1);
    expect(growthAt(36)).toBe(GROWTH);
    expect(GROWTH).toBeGreaterThan(1.3);
    expect(GROWTH).toBeLessThan(SPREAD);
    expect(growthAt(16)).toBeGreaterThan(1);
    expect(growthAt(16)).toBeLessThan(GROWTH);
  });
});

describe("leanFor: no world shows its pole", () => {
  const MOST = (30 * Math.PI) / 180;

  it("adds the eye's own height, so what the eye sees is the world's lean, wherever it stands", () => {
    expect(leanFor(0.2, 0.3)).toBeCloseTo(0.5, 9);
    expect(leanFor(0.2, -0.3)).toBeCloseTo(-0.1, 9);
  });

  it("opens a ring 30 degrees at most, however its look leans", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        (lean, seen) => {
          expect(Math.abs(leanFor(lean, seen) - seen)).toBeLessThanOrEqual(MOST + 1e-9);
        },
      ),
    );
  });
});

describe("clearOf: the page's text keeps its room", () => {
  const BOX = { left: 40, top: 660, right: 880, bottom: 1030 };

  it("is nothing inside the box, and for a body whose edge reaches it", () => {
    expect(clearOf({ x: 300, y: 800, radius: 0 }, BOX)).toBe(0);
    expect(clearOf({ x: 900, y: 800, radius: 30 }, BOX)).toBe(0);
  });

  it("is whole well away from it, on every side", () => {
    for (const [x, y] of [
      [1200, 800],
      [300, 400],
      [300, 1079],
      [0, 300],
    ] as const)
      expect(clearOf({ x, y, radius: 0 }, { ...BOX, left: 100, bottom: 900 })).toBe(1);
  });

  it("falls by degrees: a body fades out of a box, it does not pop", () => {
    const edge = clearOf({ x: 880 + 10, y: 800, radius: 0 }, BOX);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });
});
