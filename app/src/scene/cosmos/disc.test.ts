import { BODY_PIXELS, BOUNDS, Drawn, Ladder, MIDDLE, type StarSystem } from "@gnoworld/core";
import { Points, Scene as Stage, type BufferAttribute, type BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { Disposer } from "../disposer.ts";
import { ROCKS } from "./belt.ts";
import { Disc, type Sight } from "./disc.ts";

// What a look writes, from a record no map makes: so each cap is seen binding, and nothing past it reaches a buffer.
const system = (at: number, worlds: number, belt: boolean): StarSystem => ({
  id: `s${String(at)}`,
  place: { x: at * 3, y: 0, z: 0 },
  star: 1,
  warmth: 0.5,
  spin: 0.1,
  belt,
  tilt: 0,
  node: 0,
  worlds: Array.from({ length: worlds }, (_, world) => ({
    id: `s${String(at)}/${String(world)}`,
    radius: 0.9,
    orbit: 2,
    phase: world,
  })),
});

function sighted(systems: readonly StarSystem[], fill: (drawn: Drawn) => void): Sight {
  const drawn = new Drawn();
  fill(drawn);
  return {
    systems,
    ladder: new Ladder(systems),
    drawn,
    eye: { x: 0, y: 30, z: 0 },
    focal: 1158,
    isBody: () => false,
    pointShare: () => 1,
    needsHalo: (index) => index === 0,
    planeOf: () => undefined,
    inView: () => true,
    shows: () => 1,
  };
}

// What the suns' buffers hold: each sun's quad reach and its halo, in the order written.
const sunsOf = (disc: Disc) => {
  const suns = disc.group.children.find((child) => !(child instanceof Points)) as unknown as {
    geometry: BufferGeometry & { instanceCount: number };
  };
  const look = suns.geometry.getAttribute("aSun") as BufferAttribute;
  const halo = suns.geometry.getAttribute("aHalo") as BufferAttribute;
  return Array.from({ length: suns.geometry.instanceCount }, (_, at) => ({
    reach: look.getX(at),
    halo: halo.getX(at),
  }));
};

// Suns `away` from the eye, straight below it, each a system of its own; the first is the great star.
const sunsAt = (aways: readonly number[], sight: Partial<Sight> = {}) => {
  const systems = aways.map((away, at) => ({ ...system(at, 0, false), place: { x: 0, y: 30 - away, z: 0 } }));
  const base = sighted(systems, (drawn) => {
    for (const at of aways.keys()) drawn.stars[at] = at;
    drawn.starCount = aways.length;
  });
  return sunsOf(painted({ ...base, ...sight }).disc);
};

const painted = (sight: Sight) => {
  const stage = new Stage();
  const disc = new Disc(new Disposer());
  stage.add(disc.group);
  disc.paint(sight);
  const clouds = disc.group.children.filter((child): child is Points => child instanceof Points);
  const withAttribute = (name: string) => clouds.find((cloud) => cloud.geometry.hasAttribute(name));
  return { disc, dots: withAttribute("aOrbit"), rocks: withAttribute("aStar") };
};

describe("the disc's caps", () => {
  it("draws no more points than its buffer holds, bodies without their maps among them", () => {
    const systems = Array.from({ length: 60 }, (_, at) => system(at, 100, false));
    const sight = sighted(systems, (drawn) => {
      for (let at = 0; at < BOUNDS.bodies; at += 1) {
        drawn.bodySystems[at] = at % 60;
        drawn.bodyWorlds[at] = 0;
      }
      drawn.bodyCount = BOUNDS.bodies;
      for (let at = 0; at < BOUNDS.dots; at += 1) {
        drawn.dotSystems[at] = at % 60;
        drawn.dotWorlds[at] = 1 + (at % 99);
      }
      drawn.dotCount = BOUNDS.dots;
    });
    const { disc, dots } = painted(sight);
    expect(disc.dotCount).toBe(BOUNDS.dots);
    expect(dots?.geometry.drawRange.count).toBe(BOUNDS.dots);
  });

  it("lays no more rocks than its buffer holds, however many belts stand near", () => {
    const systems = Array.from({ length: 30 }, (_, at) => system(at, 1, true));
    const sight = sighted(systems, (drawn) => {
      for (let at = 0; at < 30; at += 1) drawn.near[at] = at;
      drawn.nearCount = 30;
    });
    const { disc, rocks } = painted(sight);
    expect(disc.rocks).toBe(Math.floor(BOUNDS.rocks / ROCKS) * ROCKS);
    expect(rocks?.geometry.drawRange.count).toBe(disc.rocks);
  });

  it("puts a point out as the eye leaves its star, by degrees, and out by the middle distance", () => {
    const lights = [20, 120, 200, 260, MIDDLE].map((away) => {
      const systems = [{ ...system(0, 2, false), place: { x: away, y: 30, z: 0 } }];
      const sight = sighted(systems, (drawn) => {
        drawn.stars[0] = 0;
        drawn.starCount = 1;
        drawn.dotSystems[0] = 0;
        drawn.dotWorlds[0] = 1;
        drawn.dotCount = 1;
      });
      const { dots } = painted(sight);
      return (dots?.geometry.getAttribute("aSize") as BufferAttribute).getY(0);
    });
    expect(lights[0]).toBe(1);
    for (let at = 1; at < lights.length; at += 1) expect(lights[at]).toBeLessThanOrEqual(lights[at - 1] ?? 0);
    expect(lights[2]).toBeLessThan(1);
    expect(lights.at(-1)).toBe(0);
  });

  // Seen on Onyx's file (7d6): a postcard of eight worlds draws four as bodies, and its other four stood as white discs as large as they.
  it("keeps a point a speck, half the least body's size at most, however near its world", () => {
    const systems = [{ ...system(0, 2, false), place: { x: 0, y: 30 - 20, z: 0 } }];
    const sight = sighted(systems, (drawn) => {
      drawn.dotSystems[0] = 0;
      drawn.dotWorlds[0] = 1;
      drawn.dotCount = 1;
    });
    const { dots } = painted(sight);
    expect((dots?.geometry.getAttribute("aSize") as BufferAttribute).getX(0)).toBeLessThanOrEqual(BODY_PIXELS / 2);
  });

  it("tells a region's glow from a star in what it writes", () => {
    const systems = Array.from({ length: 4 }, (_, at) => ({
      ...system(at, 0, false),
      place: { x: 400 + at * 3, y: 0, z: 0 },
    }));
    const sight = sighted(systems, (drawn) => {
      drawn.stars[0] = 0;
      drawn.starCount = 1;
      drawn.glows[0] = 0;
      drawn.glowCount = 1;
    });
    const { disc } = painted(sight);
    const suns = disc.group.children.find((child) => !(child instanceof Points)) as unknown as {
      geometry: BufferGeometry;
    };
    const look = suns.geometry.getAttribute("aSun") as BufferAttribute;
    expect(look.getZ(0)).toBe(0);
    expect(look.getZ(1)).toBe(1);
  });
});

// Chief, 2026-11-02: seen from a low slant every sun up to the middle distance lines the horizon and their halos wash the sky out; frame 4
// shows about seven halos, its other stars points.
describe("the suns' halos", () => {
  it("gives a halo to seven suns at most, the great star and the postcards' whatever their distance, then the nearest", () => {
    const aways = [40, ...Array.from({ length: 29 }, (_, at) => 10 + at * 3)];
    const suns = sunsAt(aways, { needsHalo: (index) => index === 0 || index === 29 });
    const lit = suns.flatMap(({ halo }, at) => (halo > 0 ? [at] : []));
    expect(lit).toHaveLength(7);
    expect(suns[0]?.halo).toBe(1);
    expect(suns[29]?.halo).toBe(1);
    expect(lit.filter((at) => at !== 0 && at !== 29)).toEqual([1, 2, 3, 4, 5]);
  });

  it("counts only the suns in view: one off the screen takes no halo from one on it", () => {
    const aways = [40, 12, 14, 16, 18, 20, 22, 24, 26, 28];
    const suns = sunsAt(aways, { inView: (place) => place.y !== 30 - 12 });
    expect(suns[1]?.halo).toBe(0);
    expect(suns.filter(({ halo }) => halo > 0)).toHaveLength(7);
    expect(suns[7]?.halo).toBeGreaterThan(0);
    expect(suns[8]?.halo).toBe(0);
  });

  it("shrinks and dims a far sun's halo with its distance, down to a star point of a few pixels", () => {
    const aways = [40, 20, 50, 80, 110, 140, 200];
    const suns = sunsAt(aways);
    const halos = suns.slice(1).map(({ halo }) => halo);
    expect(halos[0]).toBe(1);
    for (let at = 1; at < halos.length; at += 1) expect(halos[at]).toBeLessThanOrEqual(halos[at - 1] ?? 0);
    expect(halos[2]).toBeLessThan(1);
    expect(halos.at(-1)).toBe(0);
    const pixels = suns.map(({ reach }, at) => (reach * 1158) / (aways[at] ?? NaN));
    expect(pixels.at(-1)).toBeLessThanOrEqual(12);
    expect(pixels[1]).toBeGreaterThan(100);
  });

  // A star three units from the eye, the close world's, spread its amber over the whole screen: no halo now outgrows the great star's at
  // the approved arrival, 36 units off (305 pixels).
  it("keeps a halo by the eye no wider than the approved arrival's widest, and asks whether its heart, not its reach, is in view", () => {
    const asked: number[] = [];
    const suns = sunsAt([40, 3], {
      inView: (_, radius) => {
        asked.push(radius);
        return true;
      },
    });
    expect(((suns[1]?.reach ?? NaN) * 1158) / 3).toBeLessThanOrEqual(320);
    expect(asked).toEqual([(10 * 3) / 1158]);
  });

  // 7d6's design review against f0004: the great star's white heart 70 px across, the others' half that; a postcard's star and a near plain
  // one stood as large as the great one, and the warm light washed the sky.
  it("keeps every other sun half the great star's size on screen or less, a postcard's too, however near", () => {
    const aways = [40, 20, 30, 80, 6];
    const suns = sunsAt(aways, { needsHalo: (index) => index === 0 || index === 1 });
    const pixels = suns.map(({ reach }, at) => (reach * 1158) / (aways[at] ?? NaN));
    expect(pixels[0]).toBeCloseTo((9.5 * 1158) / 40, 6);
    for (const other of pixels.slice(1)) expect(other).toBeLessThanOrEqual((pixels[0] ?? 0) / 2 + 1e-9);
    expect(pixels[1]).toBeCloseTo((pixels[0] ?? 0) / 2, 6);
  });

  it("keeps a region's glow whole: it is no sun's halo", () => {
    const systems = [{ ...system(0, 0, false), place: { x: 0, y: -600, z: 0 } }];
    const sight = sighted(systems, (drawn) => {
      drawn.glows[0] = 0;
      drawn.glowCount = 1;
    });
    expect(sunsOf(painted(sight).disc)[0]?.halo).toBe(1);
  });
});
