import { BOUNDS, Drawn, Ladder, MIDDLE, type StarSystem } from "@gnoworld/core";
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
    shows: () => 1,
  };
}

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
