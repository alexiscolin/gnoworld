// Good entropy (slice 7, 7b4, Alexis 2026-11-02, "avec bonne entropie"): on 12,000 synthetic worlds, 500 of each anchor in 500 systems,
// each continuous value of a look and of its recipe fills its range evenly, no tenth of it holding under half its share, and no two values
// correlate past 0.1. A value is read as its place in its own world's span, so a class's ranges, which ADR-0002 §3 links on purpose, do
// not count; each anchor's share of worlds is choice.test.ts's. And only + - * / reach a value (below).
import { afterEach, describe, expect, it, vi } from "vitest";
import { NATURES } from "./choice.ts";
import {
  ANCHORS,
  asciiBytes,
  planetLook,
  planetSeed,
  worldLook,
  worldPath,
  type Anchor,
  type PlanetLook,
} from "./look.ts";
import { labOf, linearOf, paletteOf, turnOf, type Lab } from "./palette.ts";
import { BARE, CONTINENTS_SEA, ofContinents, planetRecipe, seededRecipe, worldRecipe, type Recipe } from "./recipe.ts";
import { ROWS } from "./rows.ts";
import { sha256 } from "./sha256.ts";
import { correlation } from "../testing.ts";
import { spanOf, SURFACE, type SurfaceName } from "./spans.ts";

const EACH = 500;
const SYSTEMS = 500;
const TENTHS = 10;
const LIGHTNESS = [0.9, 1.1] as const;
const CHROMA = [0.8, 1] as const;
const MOST_TURN = (12 * Math.PI) / 180;
const TURN = Math.PI * 2;
// Two values sampled on few worlds correlate by chance: at 500, a standard error of 0.045. Under 2,000 a pair is held to 0.25, which a
// byte read twice (a correlation near 1) still fails.
const MANY = 2000;
const FEW_BOUND = 0.25;
// No byte is read twice on purpose since 7b5 retired the second map's share (F3476).
const LINKED: readonly (readonly string[])[] = [];

type Span = readonly [number, number];
const word = (bytes: Uint8Array, index: number) =>
  ((bytes[index * 2] ?? 0) * 256 + (bytes[index * 2 + 1] ?? 0)) / 65535;
const lerp = (from: number, to: number, share: number) => from + (to - from) * share;
const chroma = ([, a, b]: Lab) => Math.hypot(a, b);

// A setter of a world's places: a value as its place in its span, none where the span is a point.
const placer =
  (places: Map<string, number>) =>
  (name: string, value: number, span: Span | undefined): void => {
    if (span !== undefined && span[0] < span[1]) places.set(name, (value - span[0]) / (span[1] - span[0]));
  };

// The look's own values, today's shader's, each in its row's span.
function lookPlaces(places: Map<string, number>, look: PlanetLook): void {
  const place = placer(places);
  const row = ROWS[look.anchor];
  place("spin", look.spin[0], [0, TURN]);
  place("offset", look.warp.offset[0], [0, 16]);
  place("tilt", look.tilt, [-0.45, 0.45]);
  place("warp amount", look.warp.amount, row.warp);
  place("warp frequency", look.warp.frequency, [0.9, 2.4]);
  place("recolour", look.recolour, row.recolour);
  place("relief", look.relief, row.relief);
  for (const [axis, name] of ["minor offset x", "minor offset y", "minor offset z"].entries())
    place(name, look.minorOffset[axis as 0 | 1 | 2], [0, 16]);
  if (look.rim !== null) place("air", look.rim.thickness, row.rim?.thickness);
  if (look.glow !== null) place("glow", look.glow.level, row.glow?.level);
  if (look.rings !== null) place("ring opacity", look.rings.opacity, [0.34, 0.72]);
}

// The recipe's values: the surface in its anchor's spans, the minor's share, and the palette's grade and turn.
function recipePlaces(
  places: Map<string, number>,
  id: string,
  { anchor, recipe }: { anchor: Anchor; recipe: Recipe },
): void {
  const place = placer(places);
  for (const name of Object.keys(SURFACE) as SurfaceName[]) place(name, recipe.surface[name], spanOf(anchor, name));
  place("minor share", recipe.minorShare, [0, 0.4]);
  const blend = word(planetSeed(asciiBytes(`gno.land/r/${id}`)), 6);
  const [one, other] = ROWS[anchor].palettes;
  const [from, to] = [labOf(one[1]), labOf(other[1])];
  const plain: Lab = [lerp(from[0], to[0], blend), lerp(from[1], to[1], blend), lerp(from[2], to[2], blend)];
  const graded = recipe.palette.lab[1];
  place("lightness", graded[0] / plain[0], LIGHTNESS);
  if (chroma(plain) <= 2) return;
  place("chroma", chroma(graded) / chroma(plain), CHROMA);
  let turn = Math.atan2(graded[2], graded[1]) - Math.atan2(plain[2], plain[1]);
  turn = turn > Math.PI ? turn - TURN : turn < -Math.PI ? turn + TURN : turn;
  place("hue", turn, [-MOST_TURN, MOST_TURN]);
}

function universe(): Map<string, number>[] {
  return ANCHORS.flatMap((anchor, kind) =>
    Array.from({ length: EACH }, (_, at) => {
      const id = `ns${String(at % SYSTEMS)}/world${String(kind)}x${String(at)}`;
      const path = asciiBytes(`gno.land/r/${id}`);
      const look = planetLook(path, anchor);
      const places = new Map<string, number>();
      lookPlaces(places, look);
      recipePlaces(places, id, { anchor, recipe: planetRecipe(path, anchor) });
      return places;
    }),
  );
}

function evenly(name: string, values: readonly number[]): void {
  expect(values.length, name).toBeGreaterThanOrEqual(400);
  const tenths = Array.from({ length: TENTHS }, () => 0);
  for (const value of values) {
    expect(value, name).toBeGreaterThanOrEqual(-1e-9);
    expect(value, name).toBeLessThanOrEqual(1 + 1e-9);
    const at = Math.min(TENTHS - 1, Math.floor(value * TENTHS));
    tenths[at] = (tenths[at] ?? 0) + 1;
  }
  for (const count of tenths) expect(count, name).toBeGreaterThanOrEqual(values.length / TENTHS / 2);
}

describe("good entropy, on 12,000 synthetic worlds", () => {
  it("fills each value's range evenly, no tenth under half its share, and correlates no two past 0.1", () => {
    const worlds = universe();
    const names = [...new Set(worlds.flatMap((places) => [...places.keys()]))];
    for (const name of [...Object.keys(SURFACE), "minor share", "lightness", "chroma", "hue", "tilt", "recolour"])
      expect(names, name).toContain(name);
    for (const name of names)
      evenly(
        name,
        worlds.flatMap((places) => (places.has(name) ? [places.get(name) ?? Number.NaN] : [])),
      );
    for (const [at, one] of names.entries())
      for (const other of names.slice(at + 1)) {
        if (LINKED.some((pair) => pair.includes(one) && pair.includes(other))) continue;
        const pairs = worlds.flatMap((places) => {
          const [x, y] = [places.get(one), places.get(other)];
          return x === undefined || y === undefined ? [] : [[x, y] as const];
        });
        if (pairs.length < 400) continue;
        const bound = pairs.length >= MANY ? 0.1 : FEW_BOUND;
        expect(Math.abs(correlation(pairs)), `${one} and ${other}, ${String(pairs.length)} worlds`).toBeLessThan(bound);
      }
  }, 60_000);
});

// Only + - * / reach a world's values (slice 7, 7b4; look.ts): Math's other functions are approximations each engine may round its own
// way, so a world would look different from one browser to the next. With every one of them answering NaN, a look and a recipe stay what
// they were. The `**` operator does not pass through Math and is not seen here.
const INEXACT = [
  "acos",
  "acosh",
  "asin",
  "asinh",
  "atan",
  "atan2",
  "atanh",
  "cbrt",
  "cos",
  "cosh",
  "exp",
  "expm1",
  "hypot",
  "log",
  "log10",
  "log1p",
  "log2",
  "pow",
  "sin",
  "sinh",
  "sqrt",
  "tan",
  "tanh",
] as const;

const worlds = () => [
  ...ANCHORS.map((anchor) => ({
    look: planetLook(asciiBytes("gno.land/r/samcrew/memba"), anchor),
    recipe: planetRecipe(asciiBytes("gno.land/r/samcrew/memba"), anchor),
  })),
  { look: worldLook("gnoswap/pool", "token"), recipe: worldRecipe("gnoswap/pool", "token") },
  { look: worldLook("nym-moultest123/x/amm"), recipe: worldRecipe("nym-moultest123/x/amm") },
];

describe("a world's recipe", () => {
  it("is its look's: the class its nature leans to, at its path, turned by its system", () => {
    for (const nature of [null, ...NATURES])
      for (let at = 0; at < 60; at += 1) {
        const id = `ns${String(at % 7)}/world${String(at)}`;
        const recipe = worldRecipe(id, nature);
        expect(recipe, `${id} ${String(nature)}`).toEqual(planetRecipe(worldPath(id), worldLook(id, nature).anchor));
      }
  });
});

// A world's sea turns by its system's hue, as its palettes do (Alexis, 2026-11-03, "bleu-vert variant"): two systems give two seas, one
// path always the same, its lightness and chroma kept. A temperate world's teal stays a glance (10 in Lab, core's variety.ts) from the
// frames' navy, which the Earth's sea is and the ocean keeps, at either end of the turn.
describe("a world's sea", () => {
  const NAVY = [labOf([0x1f / 255, 0x4a / 255, 0x80 / 255]), labOf([0x0b / 255, 0x22 / 255, 0x50 / 255])] as const;
  const hue = ([, a, b]: Lab) => Math.atan2(b, a);
  const turned = (one: Lab, other: Lab) =>
    Math.abs(Math.atan2(Math.sin(hue(one) - hue(other)), Math.cos(hue(one) - hue(other))));

  it("turns by its system's hue, 12 degrees at most, its lightness and chroma kept: two systems, two seas", () => {
    for (const anchor of ANCHORS) {
      const row = ROWS[anchor].sea;
      const seas = Array.from(
        { length: 40 },
        (_, at) => planetRecipe(asciiBytes(`gno.land/r/sea${String(at)}/home`), anchor).sea,
      );
      if (row === undefined) {
        expect(
          seas.every((sea) => sea === null),
          anchor,
        ).toBe(true);
        continue;
      }
      expect(new Set(seas.map((sea) => sea?.lab[1].join())).size, anchor).toBeGreaterThan(20);
      for (const sea of seas)
        for (const [at, plain] of [labOf(row.shallow), labOf(row.deep)].entries()) {
          const drawn = sea?.lab[at] ?? [0, 0, 0];
          expect(drawn[0], anchor).toBeCloseTo(plain[0], 9);
          expect(Math.hypot(drawn[1], drawn[2]), anchor).toBeCloseTo(Math.hypot(plain[1], plain[2]), 6);
          expect(turned(drawn, plain), anchor).toBeLessThanOrEqual(MOST_TURN + 1e-9);
        }
    }
    const path = asciiBytes("gno.land/r/sea0/home");
    expect(planetRecipe(path, "temperate").sea).toEqual(planetRecipe(path, "temperate").sea);
  });

  // Each colour turned as its palettes are, by the same cos and sin, shallow and deep alike, and handed linear as its Lab says.
  it("turns both of a sea's colours by the system's very turn, and hands them as their Lab colours", () => {
    for (const anchor of ANCHORS.filter((one) => ROWS[one].sea !== undefined))
      for (const share of [0, 0.3, 1]) {
        const turn = turnOf(share);
        const { sea } = seededRecipe(planetSeed(asciiBytes(`gno.land/r/${anchor}/home`)), anchor, turn);
        const row = ROWS[anchor].sea;
        if (sea === null || row === undefined) throw new Error(`${anchor} has a sea`);
        for (const [at, colour] of [row.shallow, row.deep].entries()) {
          const [l, a, b] = labOf(colour);
          const turned: Lab = [l, a * turn.cos - b * turn.sin, a * turn.sin + b * turn.cos];
          const drawn = sea.lab[at] ?? [0, 0, 0];
          expect(Math.hypot(...drawn.map((value, axis) => value - (turned[axis] ?? 0))), anchor).toBeLessThan(1e-9);
          expect(sea.linear[at], `${anchor} ${String(at)}`).toEqual(linearOf(sea.lab[at] ?? turned));
        }
      }
  });

  it("keeps a temperate world's teal a glance from the frames' navy at either end of the turn", () => {
    for (const share of [0, 1]) {
      const sea = seededRecipe(planetSeed(asciiBytes("gno.land/r/sea/home")), "temperate", turnOf(share)).sea;
      for (const [at, navy] of NAVY.entries()) {
        const drawn = sea?.lab[at] ?? navy;
        expect(
          Math.hypot(...drawn.map((value, axis) => value - (navy[axis] ?? 0))),
          String(share),
        ).toBeGreaterThanOrEqual(10);
      }
    }
  });
});

// Temperate worlds real (7b8; Alexis, 2026-11-03, "surtout naturel"): a world of continents grows the Earth's own plants and bares its
// own ground, read off its day map (earth-day.webp; 13-pixel means): forests (hue 114 to 122) to steppes (84), the Sahara's sand (L* 85),
// the outback's ochre (59), cold steppes (75); its greens' mean chroma 25.1, the low-key bound ("toujours en retenue").
describe("a world of continents", () => {
  const EARTH_MOST = 25.1;
  const DEGREE = Math.PI / 180;
  const hueOf = ([, a, b]: Lab) => Math.atan2(b, a) / DEGREE;
  const lights = ([low, mid, high]: readonly [Lab, Lab, Lab]) => [low[0], mid[0], high[0]] as const;
  const temperate = (count: number) =>
    Array.from({ length: count }, (_, at) =>
      planetRecipe(asciiBytes(`gno.land/r/t${String(at % 50)}/w${String(at)}`), "temperate"),
    );

  it("grows the Earth's plants, deep forest to dry grass, never more saturated than the Earth's own greens", () => {
    for (const { palette } of temperate(500)) {
      for (const colour of palette.lab) {
        expect(hueOf(colour)).toBeGreaterThanOrEqual(75 - 12);
        expect(hueOf(colour)).toBeLessThanOrEqual(124 + 12);
        expect(chroma(colour)).toBeLessThanOrEqual(EARTH_MOST);
      }
      const [low, mid, high] = lights(palette.lab);
      expect(low).toBeLessThan(mid);
      expect(mid).toBeLessThan(high);
      expect(low, "a deep forest").toBeLessThanOrEqual(35);
      expect(high, "a dry grass").toBeGreaterThanOrEqual(45);
    }
  });

  it("bares its ground in the Earth's tundra, ochre and sand, graded and turned as its plants", () => {
    for (const ramp of BARE) {
      for (const colour of ramp) {
        expect(hueOf(labOf(colour))).toBeGreaterThanOrEqual(55);
        expect(hueOf(labOf(colour))).toBeLessThanOrEqual(105);
        expect(chroma(labOf(colour))).toBeLessThanOrEqual(EARTH_MOST);
      }
      const [tundra, ochre, sand] = [labOf(ramp[0]), labOf(ramp[1]), labOf(ramp[2])];
      expect(hueOf(tundra), "a cold steppe").toBeGreaterThanOrEqual(70);
      expect(hueOf(ochre), "an ochre").toBeLessThanOrEqual(65);
      expect(sand[0], "a sand").toBeGreaterThanOrEqual(75);
    }
    for (const share of [0, 0.4, 1])
      for (let at = 0; at < 40; at += 1) {
        const seed = planetSeed(asciiBytes(`gno.land/r/bare${String(at)}/home`));
        const more = sha256(seed);
        const grade = {
          blend: word(seed, 6),
          lightness: lerp(...LIGHTNESS, (more[28] ?? 0) / 255),
          chroma: lerp(...CHROMA, (more[29] ?? 0) / 255),
          turn: turnOf(share),
        };
        const { minorPalette, palette } = seededRecipe(seed, "temperate", grade.turn);
        expect(minorPalette).toEqual(paletteOf(BARE, grade));
        expect(palette).toEqual(paletteOf(ROWS.temperate.palettes, grade));
      }
  });

  // The reviewer's R9: one rule for what a world of continents is, the program's too (its sea under an ocean's 0.8).
  it("takes a world for one of continents from a sea of more than none to under an ocean's", () => {
    expect(CONTINENTS_SEA).toBe(0.8);
    expect([0, 0.0001, 0.45, 0.7999, 0.8, 1].map((sea) => ofContinents({ sea }))).toEqual([
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("leaves every other world's minor in its own class's palette", () => {
    for (const anchor of ANCHORS.filter((one) => one !== "temperate"))
      for (let at = 0; at < 30; at += 1) {
        const path = asciiBytes(`gno.land/r/other${String(at)}/home`);
        const recipe = planetRecipe(path, anchor);
        expect(recipe.minorPalette, anchor).toEqual(planetRecipe(path, recipe.minor).palette);
      }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a world's values", () => {
  it("are reached with + - * / alone: Math's inexact functions are never asked", () => {
    const plain = worlds();
    for (const name of INEXACT) vi.spyOn(Math, name).mockImplementation(() => Number.NaN);
    expect(worlds()).toEqual(plain);
  });
});
