import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ANCHORS, asciiBytes, planetLook, planetSeed, type Anchor } from "./look.ts";
import { planetRecipe, worldRecipe } from "./recipe.ts";
import { ROWS } from "./rows.ts";
import { sha256 } from "./sha256.ts";
import { spanOf, SURFACE, type SurfaceName } from "./spans.ts";
import { FINEST } from "./surface.ts";

// Layer 2 (slice 7, 7b4; ADR-0002 §3): a world's surface is generated, its structure as much as its colours, from the second hash's
// bytes past its class, its nudge and its lights' form. Each parameter is a uniform 7b5 draws, named and given its unit in SURFACE, and
// read inside its anchor's span. Which byte feeds which value is stated here apart from the code: a changed index re-rolls every world.
const BYTE: Record<SurfaceName, number> = {
  scale: 9,
  lacunarity: 10,
  roughness: 11,
  warp: 12,
  erosion: 13,
  craters: 14,
  sea: 15,
  caps: 16,
  rifts: 17,
  bands: 18,
  turbulence: 19,
  storms: 20,
  clouds: 21,
  drift: 22,
  detail: 23,
  halves: 24,
  mix: 25,
};
const NAMES = Object.keys(BYTE) as SurfaceName[];
const SOLID_ONLY: readonly SurfaceName[] = ["erosion", "craters", "sea", "caps", "rifts", "halves"];
const BANDED_ONLY: readonly SurfaceName[] = ["bands", "turbulence", "storms"];
const EVERY_WORLD: readonly SurfaceName[] = ["scale", "lacunarity", "roughness", "warp", "drift", "detail", "mix"];
// Half a 4096-wide map's texels around the equator, per radius: the finest structure the close view shows at the Earth's detail.
const finest = () => 4096 / 2 / (2 * Math.PI);

const byteOf = (bytes: Uint8Array, index: number): number => {
  const byte = bytes[index];
  if (byte === undefined) throw new Error("no such byte");
  return byte;
};
const paths = (count: number, tag = "world") =>
  Array.from({ length: count }, (_, at) => asciiBytes(`gno.land/r/demo/${tag}${String(at)}`));
const flat = ([from, to]: readonly [number, number]) => from === to;
const banded = (anchor: Anchor) => ROWS[anchor].banded === true;

describe("SURFACE, what 7b5 reads", () => {
  it("names every parameter once, with a unit and a span that runs upward", () => {
    expect(Object.keys(SURFACE).sort()).toEqual([...NAMES].sort());
    for (const name of NAMES) {
      const { unit, span } = SURFACE[name];
      expect(unit.length, name).toBeGreaterThan(3);
      expect(span[0], name).toBeLessThan(span[1]);
    }
  });

  it("keeps each anchor's span inside the parameter's", () => {
    for (const anchor of ANCHORS)
      for (const name of NAMES) {
        const [from, to] = spanOf(anchor, name);
        expect(from, `${anchor} ${name}`).toBeLessThanOrEqual(to);
        expect(from, `${anchor} ${name}`).toBeGreaterThanOrEqual(SURFACE[name].span[0]);
        expect(to, `${anchor} ${name}`).toBeLessThanOrEqual(SURFACE[name].span[1]);
      }
  });

  it("states the finest scale the close view needs: two texels of the Earth's map", () => {
    expect(FINEST).toBeCloseTo(finest(), 0);
    expect(FINEST).toBeGreaterThanOrEqual(finest());
  });
});

describe("a class's structure", () => {
  it.each([...ANCHORS])("%s varies where any world does", (anchor) => {
    for (const name of EVERY_WORLD) expect(flat(spanOf(anchor, name)), name).toBe(false);
  });

  it.each([...ANCHORS])("%s is solid or banded, never both: bands on a gas, craters and seas on a ground", (anchor) => {
    const none = banded(anchor) ? SOLID_ONLY : BANDED_ONLY;
    for (const name of none) expect(spanOf(anchor, name), name).toEqual([0, 0]);
    // A world all sea has no ground for craters to mark.
    const ground = !banded(anchor) && spanOf(anchor, "sea")[1] < 0.97;
    const some: readonly SurfaceName[] = banded(anchor) ? BANDED_ONLY : ground ? ["erosion", "craters"] : [];
    for (const name of some) expect(flat(spanOf(anchor, name)), name).toBe(false);
  });

  it.each([...ANCHORS])("%s has a sea only with a sea's colours, and clouds only with air", (anchor) => {
    const look = planetLook(paths(1)[0] ?? new Uint8Array(), anchor);
    if (look.sea === null) expect(spanOf(anchor, "sea")).toEqual([0, 0]);
    else expect(spanOf(anchor, "sea")[0]).toBeGreaterThan(0.5);
    if (look.rim === null) expect(spanOf(anchor, "clouds")).toEqual([0, 0]);
  });

  it("reads as its class: a rock is cratered, an Earth has seas, a giant has bands, a Europa has rifts", () => {
    expect(spanOf("rocky", "craters")[0]).toBeGreaterThanOrEqual(0.5);
    expect(spanOf("temperate", "sea")[0]).toBeGreaterThanOrEqual(0.5);
    expect(spanOf("temperate", "sea")[1]).toBeLessThanOrEqual(0.8);
    expect(spanOf("ocean", "sea")[0]).toBeGreaterThanOrEqual(0.8);
    expect(spanOf("gas giant", "bands")[0]).toBeGreaterThanOrEqual(10);
    expect(spanOf("ice giant", "bands")[1]).toBeLessThan(spanOf("gas giant", "bands")[0]);
    expect(spanOf("ice", "rifts")[0]).toBeGreaterThanOrEqual(0.4);
    expect(spanOf("shattered", "rifts")[0]).toBeGreaterThanOrEqual(0.5);
    expect(spanOf("cloud deck", "clouds")[0]).toBeGreaterThanOrEqual(0.8);
    expect(spanOf("desert", "erosion")[0]).toBeGreaterThan(0);
  });
});

describe("a world's surface", () => {
  it.each([...ANCHORS])("%s reads each parameter from its own byte of the second hash, inside its span", (anchor) => {
    for (const path of paths(60)) {
      const more = sha256(planetSeed(path));
      const { surface } = planetRecipe(path, anchor);
      for (const name of NAMES) {
        const [from, to] = spanOf(anchor, name);
        expect(surface[name], name).toBeCloseTo(from + (to - from) * (byteOf(more, BYTE[name]) / 255), 10);
      }
    }
  });

  it("reaches the close view's finest scale in octaves, and stops at the first that does", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), fc.constantFrom(...ANCHORS), (path, anchor) => {
        const { scale, lacunarity, octaves } = planetRecipe(path, anchor).surface;
        expect(Number.isInteger(octaves)).toBe(true);
        expect(scale * lacunarity ** (octaves - 1)).toBeGreaterThanOrEqual(finest());
        expect(scale * lacunarity ** (octaves - 2)).toBeLessThan(finest());
      }),
    );
  });

  it("asks several octaves of every world, never one: the Earth's detail at the close view", () => {
    const counts = Array.from({ length: 500 }, (_, at) => worldRecipe(`demo/world${String(at)}`).surface.octaves);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...counts)).toBeLessThanOrEqual(14);
  });

  it("leaves no value unset, for the empty path and a long one", () => {
    for (const path of [new Uint8Array(0), new Uint8Array(2000).fill(0x61)])
      for (const anchor of ANCHORS)
        for (const value of Object.values(planetRecipe(path, anchor).surface))
          expect(Number.isFinite(value)).toBe(true);
  });
});

describe("a world's mix of two classes (ADR-0002 §3)", () => {
  it("draws a minor class other than the dominant one, its share 0.4 at most: the dominant keeps 60%", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), fc.constantFrom(...ANCHORS), (path, anchor) => {
        const { minor, minorShare } = planetRecipe(path, anchor);
        expect(minor).not.toBe(anchor);
        expect(ANCHORS).toContain(minor);
        expect(minorShare).toBeGreaterThanOrEqual(0);
        expect(minorShare).toBeLessThanOrEqual(0.4);
      }),
    );
  });

  it("takes the minor's share from the byte today's second map reads, and its detail from the minor's first map", () => {
    for (const path of paths(80, "mix")) {
      const recipe = planetRecipe(path, "desert");
      expect(recipe.minorShare).toBeCloseTo((byteOf(planetSeed(path), 15) / 255) * 0.4, 12);
      expect(recipe.minorMap).toBe(ROWS[recipe.minor].maps[0]);
    }
  });

  it("gives every pair its chance: every minor under a dominant, over a few thousand worlds", () => {
    const minors = new Set(paths(3000, "pair").map((path) => planetRecipe(path, "volcanic").minor));
    expect([...minors].sort()).toEqual(ANCHORS.filter((anchor) => anchor !== "volcanic").sort());
  });
});
