// The generated worlds polished (slice 7, 7b6): each class's look against the reference it is measured on, on the lab's close views
// (two seeds where a look is a class's) and its views of one class. Each number below names its source; 7b5's, read on the same views
// at cbb0a480, are what each test moves from. SwiftShader's picture is never the verdict on beauty: the design reviewer reads the
// frames, and judges "no regular figure on any world" beside the straight runs held here.

import { ANCHORS, type Anchor } from "@gnoworld/core";
import { expect, test, type Page } from "./fixtures.ts";
import { askLab, circles, drawn, heldQuiet, open, picture, type Circle } from "./lab.ts";
import { lines } from "./lines.ts";
import { apart, details } from "./portraits.ts";
import { cores, darkest, lightness, wholeRows } from "./surfaces.ts";
import { grain, landOn } from "./textures.ts";

// Frame 4's "Music" world (f0004.jpg, its disc at 1254, 771, radius 36; lines.ts), and the same disc magnified ten times: its veins'
// net ends 0.12 and 0.30 times a junction, 132 and 186 junctions; its glow covers 0.66 and 0.68 of the disc; its veins 0.057 and
// 0.069 of the radius wide, their width's spread 0.65 and 0.48. 7b5's worm loops: 1.30 ends a junction, glow 0.26, 0.006 r wide.
const NET = { junctions: 50, endsPerJunction: 0.4, glow: [0.33, 0.8], width: [0.03, 0.1], widthSpread: 0.3 } as const;
// The core the brief asks, #ffc870 (luma 205), gold to orange: its blue over red 0.44 sets the bound, never white (Music's own top 2%,
// #fcd3b2, reads 0.70 through the video's compression); 7b5's #b8853a, luma 138.
const CORE = { luma: 0.8 * 205, blueOverRed: 0.6, greenOverRed: [0.6, 0.9] } as const;
// A shattered crust's fractures (the chief, 7b5's pass2: neon tubes, straight lines making triangles): Music's veins, read as lines,
// run straight on 7% to 12% of their 60 px windows, their light's spread 0.31 to 0.39, following their width by 0.47 to 0.60; 7b5's
// arcs run straight on 82%, their light's spread 0.16 (a tube's even light), following their width by 0.33.
const FRACTURES = { length: 300, straight: 0.2, light: 0.25, widthLight: 0.4, widthSpread: 0.4 } as const;
// The minor of a dark palette in its main class's lightness: 7b5's cream patches moved a dark carbon disc's lightness by up to 39 L*,
// 74% of it past 20. A minor still shows: a quarter of the worlds moved on 10% of their lit disc at least (generated.spec.ts's floor).
const MINOR = { move: 5, far: 0.1, shown: 0.1, worlds: 6 } as const;
// Ganymede's grooves, sharp parallel sets crossing at angles, read on the bright ground of their lanes (textures.ts): a quarter of its
// ordered tiles 45 degrees or more from their commonest way, and a tenth echoing at 6 to 10 px. 7b5's smudged grooved world (caeda94b)
// reads 0.04 and 0.04; the Earth 0.46 and 0.05, a rocky world 0.43 and 0.01, a desert 0.02 and 0.08: none holds both (7b6's report).
const GROOVES = { crossing: 0.25, period: 0.1 } as const;
// A giant's fine steps along a latitude over across it (F4239): Jupiter on frame 104 (a box clear of its grid, 1020 to 1125 by 470
// to 627) reads 0.78; 7b5's fivefold streaks 0.10 to 0.29; a third of Jupiter's at least.
const GIANTS: readonly Anchor[] = [
  "gas giant",
  "ice giant",
  "cloud deck",
  "water cloud giant",
  "azure giant",
  "dark giant",
  "hot giant",
  "sub-Neptune",
];
const ALONG_AT_LEAST = 0.78 / 3;
// A giant's minor as whole bands (F4245): of what the minor moves in colour, the share in strips mostly moved, along its bands' lean
// (surfaces.ts). The median over 24 gas giants: 7b5's pieces 0.57; whole bands, its worlds' edges and limbs read, about 0.8.
const WHOLE_BANDS = 0.75;
// Io's calderas dark but never punched black: the well-lit ground's 0.5th percentile over its median no darker than a cratered
// ground's darkest (rocky 0.27, the Earth 0.29) by more than a quarter, and calderas there (7b5's Io 0.115, luma 17 in 150).
const CALDERA = [0.2, 0.5] as const;
// Temperate worlds of continents (F4243): the Earth's close view holds 83% of its land in one piece and 42% of its lit disc in land
// (textures.ts's land: lit, its blue not leading, no cloud); 7b5's 24 temperate worlds' medians 0.51 and 0.34. Land, but no desert
// world, and no world all sea from the eye (7b6's design review: 3 of 24 under 5%, the gallery's own 0.6%, at e43c31f9).
const CONTINENT = 0.7;
const LAND = [0.3, 0.6] as const;
const ALL_SEA = 0.05;

const close = (anchor: Anchor) => `?view=close&world=${String(ANCHORS.indexOf(anchor))}`;
const ofClass = (anchor: Anchor) => `?view=class24&world=${String(ANCHORS.indexOf(anchor))}`;
const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const SEEDS = 2;

const placeOf = async (page: Page): Promise<Circle> => {
  const [place] = await circles(page);
  if (place === undefined) throw new Error("no world");
  return place;
};
const nextSeed = async (page: Page) => {
  await page.keyboard.press("s");
  await drawn(page);
};

/** The volcanic worlds seen close in `style` (generated.ts's styleOf), the first `SEEDS` seeds that take it, each as it is read. */
async function styled(page: Page, style: number, read: (place: Circle) => Promise<void>): Promise<void> {
  await open(page, close("volcanic"));
  let found = 0;
  for (let tries = 0; tries < 24 && found < SEEDS; tries += 1) {
    if ((await askLab<number[]>(page, "styles"))[0] === style) {
      await read(await placeOf(page));
      found += 1;
    }
    await nextSeed(page);
  }
  expect(found, `volcanic worlds of style ${String(style)}`).toBe(SEEDS);
}

/** A class's world seen close on its first `SEEDS` seeds. */
async function seeds(page: Page, anchor: Anchor, read: (place: Circle, shot: Buffer) => Promise<void>): Promise<void> {
  await open(page, close(anchor));
  for (let seed = 0; seed < SEEDS; seed += 1) {
    if (seed > 0) await nextSeed(page);
    const place = await placeOf(page);
    await read(place, await picture(page));
  }
}

/** A view of one class with its minor taken out, then with it: the two pictures and where its worlds stand. */
async function withMinor(page: Page, anchor: Anchor) {
  await open(page, `${ofClass(anchor)}&minor=off`);
  const places = await circles(page);
  const plain = await picture(page);
  await open(page, ofClass(anchor));
  return { places, pictures: [plain, await picture(page)] as const };
}

test.describe("the generated worlds polished", () => {
  test.slow();

  heldQuiet();

  test("a veined volcanic world is a net of cells, as frame 4's Music: veins that meet, wide and varied, their cores gold", async ({
    page,
  }) => {
    await styled(page, 1, async (place) => {
      const shot = await picture(page);
      const [net] = await lines(page, shot, { discs: [place], kind: "veins" });
      const [core] = await cores(page, shot, [place]);
      if (net === undefined || core === undefined) throw new Error("no measure");
      test.info().annotations.push({ type: "veins", description: JSON.stringify({ net, core }) });
      expect(net.junctions, "a net").toBeGreaterThanOrEqual(NET.junctions);
      expect(net.ends / net.junctions, "cells close: veins end seldom").toBeLessThanOrEqual(NET.endsPerJunction);
      expect(net.glow, "veins over the disc").toBeGreaterThanOrEqual(NET.glow[0]);
      expect(net.glow, "dark cells between them").toBeLessThanOrEqual(NET.glow[1]);
      expect(net.width / place.r, "wide veins").toBeGreaterThanOrEqual(NET.width[0]);
      expect(net.width / place.r, "veins, not a glowing crust").toBeLessThanOrEqual(NET.width[1]);
      expect(net.widthSpread, "their width varies").toBeGreaterThanOrEqual(NET.widthSpread);
      const [red, green, blue] = core.colour;
      expect(core.luma, "a hot core").toBeGreaterThanOrEqual(CORE.luma);
      expect(blue / red, "gold, never white").toBeLessThanOrEqual(CORE.blueOverRed);
      expect(green / red, "gold to orange").toBeGreaterThanOrEqual(CORE.greenOverRed[0]);
      expect(green / red, "gold to orange").toBeLessThanOrEqual(CORE.greenOverRed[1]);
    });
  });

  test("a shattered world's fractures run no straight line, and vary, their glow on their wider parts: no neon tube", async ({
    page,
  }) => {
    await seeds(page, "shattered", async (place, shot) => {
      const [cracks] = await lines(page, shot, { discs: [place], kind: "fractures" });
      if (cracks === undefined) throw new Error("no measure");
      test.info().annotations.push({ type: "fractures", description: JSON.stringify(cracks) });
      expect(cracks.length, "fractures to read").toBeGreaterThanOrEqual(FRACTURES.length);
      if (cracks.windows > 0)
        expect(cracks.straight / cracks.windows, "no straight run").toBeLessThanOrEqual(FRACTURES.straight);
      expect(cracks.lightSpread, "their glow varies").toBeGreaterThanOrEqual(FRACTURES.light);
      expect(cracks.widthLight, "the wider, the brighter").toBeGreaterThanOrEqual(FRACTURES.widthLight);
      expect(cracks.widthSpread, "their width varies").toBeGreaterThanOrEqual(FRACTURES.widthSpread);
    });
  });

  test("a dark carbon world's minor keeps its main class's lightness, and still shows", async ({ page }) => {
    const { places, pictures } = await withMinor(page, "dark carbon");
    const moves = await lightness(page, pictures, places);
    test.info().annotations.push({ type: "lightness", description: JSON.stringify(moves) });
    for (const [at, { move, far }] of moves.entries()) {
      expect(Math.abs(move), `world ${String(at)}: its lightness`).toBeLessThanOrEqual(MINOR.move);
      expect(far, `world ${String(at)}: no cream patch`).toBeLessThanOrEqual(MINOR.far);
    }
    const shown = (await apart(page, pictures, places)).filter(({ moved }) => moved > MINOR.shown);
    expect(shown.length, "worlds that show their minor").toBeGreaterThanOrEqual(MINOR.worlds);
  });

  test("a grooved world seen close: sharp parallel grooves, in sets that cross at angles", async ({ page }) => {
    await seeds(page, "grooved ice", async (place, shot) => {
      const [read] = await grain(page, shot, [place]);
      if (read === undefined) throw new Error("no measure");
      test.info().annotations.push({ type: "grain", description: JSON.stringify(read) });
      expect(read.crossing, "sets crossing at angles").toBeGreaterThanOrEqual(GROOVES.crossing);
      expect(read.period, "parallel grooves at their spacing").toBeGreaterThanOrEqual(GROOVES.period);
    });
  });

  for (const giant of GIANTS)
    test(`a ${giant} seen close holds its fine detail without the fivefold streak (F4239)`, async ({ page }) => {
      await open(page, close(giant));
      const place = await placeOf(page);
      const [read] = await details(page, await picture(page), [place]);
      test.info().annotations.push({ type: "along", description: String(read?.along) });
      expect(read?.along).toBeGreaterThanOrEqual(ALONG_AT_LEAST);
    });

  test("a giant's minor is whole bands, never pieces, and still shows (F4245)", async ({ page }) => {
    const { places, pictures } = await withMinor(page, "gas giant");
    const rows = await wholeRows(page, pictures, places);
    test.info().annotations.push({ type: "rows", description: JSON.stringify(rows) });
    expect(median(rows), "whole bands").toBeGreaterThanOrEqual(WHOLE_BANDS);
    const shown = (await apart(page, pictures, places)).filter(({ moved }) => moved > MINOR.shown);
    expect(shown.length, "worlds that show their minor").toBeGreaterThanOrEqual(MINOR.worlds);
  });

  test("Io's calderas are dark ground, never punched black", async ({ page }) => {
    await styled(page, 2, async (place) => {
      const [floor] = await darkest(page, await picture(page), [place]);
      if (floor === undefined) throw new Error("no measure");
      test.info().annotations.push({ type: "calderas", description: JSON.stringify(floor) });
      expect(floor.darkest / floor.median, "never punched black").toBeGreaterThanOrEqual(CALDERA[0]);
      expect(floor.darkest / floor.median, "calderas there").toBeLessThanOrEqual(CALDERA[1]);
    });
  });

  test("24 temperate worlds hold continents, as the Earth does, not islands (F4243)", async ({ page }) => {
    await open(page, ofClass("temperate"));
    const land = await landOn(page, await picture(page), await circles(page));
    test.info().annotations.push({ type: "land", description: JSON.stringify(land) });
    expect(median(land.map(({ largest }) => largest)), "one large piece").toBeGreaterThanOrEqual(CONTINENT);
    expect(median(land.map(({ share }) => share)), "land").toBeGreaterThanOrEqual(LAND[0]);
    expect(median(land.map(({ share }) => share)), "and sea").toBeLessThanOrEqual(LAND[1]);
    for (const [at, { share }] of land.entries())
      expect(share, `world ${String(at)}: some land`).toBeGreaterThan(ALL_SEA);
  });
});
