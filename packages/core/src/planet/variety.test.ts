// Variety is measured, not counted (slice 7, 7b4; ADR-0002 §3): each world has a feature vector, its class, its minor class, the
// palette's centre in Lab, what its surface shows and its rings and air, and two worlds are alike when a glance would take one for the
// other. The bound on alike neighbours in a view is the golden in server/src/worlds/group.test.ts, on the recorded list and ten times it.
// What a still shows: a cloud's drift and an octave's ratio do not.
import { describe, expect, it } from "vitest";
import { ANCHORS, asciiBytes, planetLook } from "./look.ts";
import type { Lab } from "./palette.ts";
import { planetRecipe, type Recipe } from "./recipe.ts";
import { SURFACE } from "./spans.ts";
import { alike, featuresOf, type Features } from "./variety.ts";

const SHOWN = [
  "scale",
  "roughness",
  "warp",
  "erosion",
  "craters",
  "sea",
  "caps",
  "rifts",
  "bands",
  "turbulence",
  "storms",
  "clouds",
  "detail",
  "halves",
  "mix",
] as const;
const SAME_COLOUR = 10;
const SAME_SHAPE = 0.1;
const DAO = asciiBytes("gno.land/r/gov/dao");

const desert = (): Features => featuresOf(planetLook(DAO, "desert"), planetRecipe(DAO, "desert"));
const moved = (recipe: Recipe, name: (typeof SHOWN)[number], by: number): Recipe => {
  const [from, to] = SURFACE[name].span;
  return { ...recipe, surface: { ...recipe.surface, [name]: recipe.surface[name] + by * (to - from) } };
};
// The centre moved by `by` in Lab along a direction.
const tinted = (features: Features, by: number, [dl, da, db]: Lab): Features => {
  const length = Math.hypot(dl, da, db);
  const [l, a, b] = features.centre;
  return { ...features, centre: [l + (by * dl) / length, a + (by * da) / length, b + (by * db) / length] };
};

describe("featuresOf", () => {
  it("reads a world's class, minor class, palette centre, rings and air", () => {
    const look = planetLook(DAO, "gas giant");
    const recipe = planetRecipe(DAO, "gas giant");
    const features = featuresOf(look, recipe);
    expect(features.anchor).toBe("gas giant");
    expect(features.minor).toBe(recipe.minor);
    expect(features.minorShare).toBe(recipe.minorShare);
    expect(features.centre).toEqual(recipe.palette.lab[1]);
    expect(features.ringed).toBe(look.rings !== null);
    expect(features.air).toBe(look.rim?.thickness ?? 0);
  });

  it("puts each shown value on its whole span, 0 to 1, and leaves out what a still cannot show", () => {
    for (const anchor of ANCHORS) {
      const recipe = planetRecipe(DAO, anchor);
      const { shape } = featuresOf(planetLook(DAO, anchor), recipe);
      expect(shape).toHaveLength(SHOWN.length);
      for (const [at, name] of SHOWN.entries()) {
        const [from, to] = SURFACE[name].span;
        expect(shape[at], `${anchor} ${name}`).toBeCloseTo((recipe.surface[name] - from) / (to - from), 12);
      }
    }
  });
});

describe("alike", () => {
  it("takes a world for itself, or the bound on neighbours would hold for nothing", () => {
    expect(alike(desert(), desert())).toBe(true);
  });

  it("holds under a step a glance misses: a colour under 10 in Lab, a shape under a tenth of its span", () => {
    const look = planetLook(DAO, "desert");
    const recipe = planetRecipe(DAO, "desert");
    for (const direction of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 1],
      [1, -1, 0],
    ] as const)
      expect(alike(desert(), tinted(desert(), SAME_COLOUR * 0.9, direction)), direction.join()).toBe(true);
    for (const name of SHOWN)
      expect(alike(desert(), featuresOf(look, moved(recipe, name, SAME_SHAPE * 0.9))), name).toBe(true);
  });

  it("parts two worlds at a step a glance sees, on any one axis or across the colour's three", () => {
    const look = planetLook(DAO, "desert");
    const recipe = planetRecipe(DAO, "desert");
    for (const direction of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 1],
      [1, -1, 0],
    ] as const)
      expect(alike(desert(), tinted(desert(), SAME_COLOUR * 1.1, direction)), direction.join()).toBe(false);
    for (const name of SHOWN)
      expect(alike(desert(), featuresOf(look, moved(recipe, name, SAME_SHAPE * 1.1))), name).toBe(false);
    expect(alike(desert(), { ...desert(), anchor: "rocky" })).toBe(false);
    expect(alike(desert(), { ...desert(), ringed: !desert().ringed })).toBe(false);
    expect(alike(desert(), { ...desert(), air: desert().air + 0.006 })).toBe(false);
  });

  it("parts two minor classes once either shows, from a tenth of its span, and not two that barely do", () => {
    const withMinor = (minorShare: number, minor: Features["minor"]): Features => ({ ...desert(), minorShare, minor });
    expect(alike(withMinor(0.3, "ice"), withMinor(0.3, "ocean"))).toBe(false);
    expect(alike(withMinor(0.04, "ice"), withMinor(0.04, "ocean"))).toBe(false);
    expect(alike(withMinor(0.039, "ice"), withMinor(0.039, "ocean"))).toBe(true);
    expect(alike(withMinor(0.041, "ice"), withMinor(0.02, "ocean"))).toBe(false);
    expect(alike(withMinor(0.02, "ice"), withMinor(0.041, "ocean"))).toBe(false);
    expect(alike(withMinor(0.3, "ice"), withMinor(0.3 + 0.4 * SAME_SHAPE * 1.1, "ice"))).toBe(false);
  });

  it("reads both ways", () => {
    const other = featuresOf(
      planetLook(asciiBytes("gno.land/r/gov/dao2"), "desert"),
      planetRecipe(asciiBytes("gno.land/r/gov/dao2"), "desert"),
    );
    expect(alike(desert(), other)).toBe(alike(other, desert()));
  });
});
