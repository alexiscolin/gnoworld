// Temperate worlds varied and real at the coast (slice 7, 7b8; Alexis, 2026-11-03, docs/decisions.md): sharp coasts with their islands
// and a thin shelf, shapes from the seed, climates by latitude, natural low-key colours, each read on 64 seeds or more (the lab's paths,
// a hash each, never a chosen few), the Earth's own number beside it (its view at realism.spec's instant at a close world's zoom; its day
// map, unlit, by latitude). Each main bound failed on 81e07949, whose numbers the comments give; "held" marks one that passed there too.

import { ANCHORS, type Surface } from "@gnoworld/core";
import { climatesOn, mapClimateOn, type Climate, type Pole } from "./climates.ts";
import { shoresOn, type Shore } from "./coasts.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { askLab, circles, EARTH_INSTANT, EARTH_VIEW, heldQuiet, open, picture, type Circle } from "./lab.ts";
import { facesApart, facesOn, GLANCE, type Face } from "./textures.ts";

// Coasts at a close world's zoom (radius 350 px, the Earth's view 356), the median world's: the coast's length over its smoothed copy's,
// the Earth's 3.93 (81e07949: 0.44 to 0.50 of it), never past 1.6 times it (speckle); islands per continent, the Earth's 4 (0.08 to 0.35).
const COAST = { jagged: [0.6, 1.6], islands: 0.5 } as const;
// The sea's lift past a coast, in L*, the worlds' mean (coasts.ts's Shore): no wide halo, the Earth's -1.5 (81e07949: 1.9 to 2.5); a thin
// shelf (held, 1.9 to 2.6 there; the Earth's view -0.1, its shelves under a pixel at this zoom).
const SEA = { halo: 1, shelf: 0.5 } as const;
// Shapes on the classes' view without clouds (24 worlds a seed, 94 px of radius): the smoothed coast over the root of the land, 3.5 for one
// round piece, the Earth's face 4.3; a tenth of the worlds as gathered (81e07949's tenth 5.4).
const GATHERED = 4.5;
// Held (they passed on 81e07949, where the eye's face, cut by the night, spread the largest piece's share from 0.40 to 0.98): a tenth an
// archipelago of eight pieces, the largest piece's spread, several continents of a size on a sixth, 7b6's land and sea (F4243).
const HELD = {
  pieces: 8,
  archipelagos: 0.1,
  largest: [0.45, 0.85],
  several: 1 / 6,
  land: [0.3, 0.6],
  allSea: 0.05,
} as const;
// Land by latitude from its hue and greenness alone (a disc's light falls toward its poles; the Earth's map is unlit): the middle band (40
// to 60 degrees) greener than the tropics (15 to 35), the Earth's map 21.4 degrees, a third at the median world (81e07949: -5.4).
const GREENER = 7;
// A seed's tilt, correlations over 72 worlds: a drier one barer (its minor share against its land not green; held, 0.33 there), a colder
// one barer between (its caps against the middle band not green; -0.07 there).
const TILT = { drier: 0.3, colder: 0.3 } as const;
// Natural colours (Alexis, 2026-11-03, "surtout naturel"): each world's land in the Earth's hues, its map's ochre 59 less a system's turn,
// to its greens' 144 on its view (their 90th percentile; their map's 125), 81e07949's 23 to 159; spread (held), never grey (held).
const HUES = { range: [47, 144], spread: 25, grey: 4 } as const;
// Low-key: the median world's chroma no more than the Earth's view's (6.4) times its map's forest over its desert (28.5 over 16.3, a green
// world against the Earth's arid face), none past frame 4's median world (12.9, its ten worlds in f0004). 81e07949: 13.3, 24.0.
const SATURATION = { forestOverDesert: 28.5 / 16.3, frame4: 12.9 } as const;
// Never the Earth (7b7; Alexis, 2026-11-03, 16:4x), its coasts and shapes now compared too, at its own zoom: a world reads apart by its
// sea, its land or its clouds a glance off (textures.ts's GLANCE), or its coast or its shape a quarter off the Earth's.
const SHAPE_APART = 0.25;
const WORLD = ANCHORS.indexOf("temperate");
const PARTS = 4;
const PER_PART = 16;
const VIEWS = 3;
const ENOUGH = 64;

const quantile = (values: readonly number[], at: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(at * values.length))] ?? 0;
const hueOf = ([, a, b]: readonly number[]) => (Math.atan2(b ?? 0, a ?? 0) * 180) / Math.PI;
function correlation(pairs: readonly (readonly [number, number])[]): number {
  const mean = (at: 0 | 1) => pairs.reduce((sum, pair) => sum + pair[at], 0) / Math.max(pairs.length, 1);
  const [mx, my] = [mean(0), mean(1)];
  let [xy, xx, yy] = [0, 0, 0];
  for (const [x, y] of pairs) [xy, xx, yy] = [xy + (x - mx) * (y - my), xx + (x - mx) ** 2, yy + (y - my) ** 2];
  return xx === 0 || yy === 0 ? 0 : xy / Math.sqrt(xx * yy);
}

interface Earth {
  readonly shore: Shore;
  readonly face: Face;
  readonly chroma: number;
  readonly map: Climate;
}
// The Earth's measures, once a worker: its view is the same on every visit, its map one file.
let earthRead: Earth | undefined;
async function earthOf(page: Page): Promise<Earth> {
  if (earthRead !== undefined) return earthRead;
  await page.clock.setFixedTime(EARTH_INSTANT);
  await open(page, "?view=earth");
  const shot = await picture(page);
  const [[shore], [face], [lit]] = [
    await shoresOn(page, shot, [EARTH_VIEW]),
    await facesOn(page, shot, [EARTH_VIEW]),
    await climatesOn(page, shot, [[EARTH_VIEW, [0, 1, 0]]]),
  ];
  const map = await mapClimateOn(page, await (await page.request.get("/textures/earth-day.webp")).body());
  if (shore === undefined || face === undefined || lit === undefined) throw new Error("no Earth");
  earthRead = { shore, face, chroma: lit.chroma, map };
  return earthRead;
}

/** The classes' view of temperate worlds at three seeds, without clouds: 72 worlds, each with its place, its pole, its surface and its
 * minor's share. */
async function seventyTwo(page: Page) {
  const views: { shot: Buffer; places: Circle[]; poles: Pole[]; surfaces: Surface[]; minors: number[] }[] = [];
  for (let seed = 0; seed < VIEWS; seed += 1) {
    await open(page, `?view=class24&world=${String(WORLD)}&clouds=off&seed=${String(seed)}`);
    views.push({
      shot: await picture(page),
      places: await circles(page),
      poles: await askLab<Pole[]>(page, "poles"),
      surfaces: await askLab<Surface[]>(page, "surfaces"),
      minors: await askLab<number[]>(page, "minors"),
    });
  }
  return views;
}

const climatesOf = async (page: Page) =>
  (
    await Promise.all(
      (await seventyTwo(page)).map(async ({ shot, places, poles, surfaces, minors }) =>
        (
          await climatesOn(
            page,
            shot,
            places.map((place, at) => [place, poles[at] ?? [0, 1, 0]] as const),
          )
        ).map((climate, at) => ({ climate, caps: surfaces[at]?.caps ?? 0, minor: minors[at] ?? 0 })),
      ),
    )
  ).flat();

test.describe("temperate worlds varied and real at the coast", () => {
  test.slow();

  heldQuiet();

  for (let part = 0; part < PARTS; part += 1)
    test(`a temperate world's coast runs sharp and broken, islands off it and a thin shelf, as the Earth's (seeds ${String(part * PER_PART)} on)`, async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const earth = await earthOf(page);
      const [shores, faces]: [Shore[], Face[]] = [[], []];
      for (let seed = part * PER_PART; seed < (part + 1) * PER_PART; seed += 1) {
        await open(page, `?view=close&world=${String(WORLD)}&seed=${String(seed)}`);
        const [shot, places] = [await picture(page), await circles(page)];
        shores.push(...(await shoresOn(page, shot, places)));
        faces.push(...(await facesOn(page, shot, places)));
      }
      const per = shores.map(({ islands, continents }) => islands / Math.max(continents, 1));
      const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
      const read = {
        jagged:
          quantile(
            shores.map(({ jagged }) => jagged),
            0.5,
          ) / earth.shore.jagged,
        islands: quantile(per, 0.5) / (earth.shore.islands / Math.max(earth.shore.continents, 1)),
        halo: mean(shores.map(({ halo }) => halo)),
        shelf: mean(shores.map(({ shelf }) => shelf)),
      };
      test
        .info()
        .annotations.push({ type: "coasts", description: JSON.stringify({ earth: earth.shore, read, shores }) });
      expect(shores, "worlds read").toHaveLength(PER_PART);
      expect(read.jagged, "jagged as the Earth's").toBeGreaterThanOrEqual(COAST.jagged[0]);
      expect(read.jagged, "a coast, not speckle").toBeLessThanOrEqual(COAST.jagged[1]);
      expect(read.islands, "islands off its continents").toBeGreaterThanOrEqual(COAST.islands);
      expect(read.halo, "no wide halo of shallow sea").toBeLessThanOrEqual(SEA.halo);
      expect(read.shelf, "a thin shelf").toBeGreaterThanOrEqual(SEA.shelf);
      const off = (value: number, earths: number) => Math.abs(value / earths - 1) >= SHAPE_APART;
      for (const [at, face] of faces.entries()) {
        const { sea, land, clouds } = facesApart(face, earth.face);
        const { jagged = earth.shore.jagged, broken = earth.shore.broken } = shores[at] ?? {};
        const apart = [sea >= GLANCE.colour, land >= GLANCE.colour, clouds >= GLANCE.clouds];
        expect(
          [...apart, off(jagged, earth.shore.jagged), off(broken, earth.shore.broken)],
          `world ${String(at)}`,
        ).toContain(true);
      }
    });

  test("temperate worlds take every shape from their seed: one supercontinent, several continents, an archipelago", async ({
    page,
  }) => {
    const earth = await earthOf(page);
    const shores = (
      await Promise.all((await seventyTwo(page)).map(({ shot, places }) => shoresOn(page, shot, places)))
    ).flat();
    const [broken, largest] = [shores.map((shore) => shore.broken), shores.map(({ pieces }) => pieces[0] ?? 0)];
    const share = (count: number) => count / shores.length;
    const read = {
      gathered: quantile(broken, 0.1),
      archipelagos: share(shores.filter(({ pieces }) => pieces.length >= HELD.pieces).length),
      largest: [quantile(largest, 0.1), quantile(largest, 0.9)],
      several: share(shores.filter(({ pieces: [first = 0, second = 0] }) => second >= 0.4 * first).length),
      land: quantile(
        shores.map((shore) => shore.share),
        0.5,
      ),
    };
    test.info().annotations.push({ type: "shapes", description: JSON.stringify({ earth: earth.shore, read, shores }) });
    expect(shores.length, "worlds read").toBeGreaterThanOrEqual(ENOUGH);
    expect(read.gathered, "gathered as the Earth's face").toBeLessThanOrEqual(GATHERED);
    expect(read.archipelagos, "archipelagos").toBeGreaterThanOrEqual(HELD.archipelagos);
    expect(read.largest[0], "a largest piece small on some").toBeLessThanOrEqual(HELD.largest[0]);
    expect(read.largest[1], "and nearly the whole land on others").toBeGreaterThanOrEqual(HELD.largest[1]);
    expect(read.several, "several continents of a size").toBeGreaterThanOrEqual(HELD.several);
    expect(read.land, "land").toBeGreaterThanOrEqual(HELD.land[0]);
    expect(read.land, "and sea").toBeLessThanOrEqual(HELD.land[1]);
    for (const [at, shore] of shores.entries())
      expect(shore.share, `world ${String(at)}: some land`).toBeGreaterThan(HELD.allSea);
  });

  test("a temperate world's land follows its latitude and its seed: deserts about the tropics, greener between, barer dry or cold", async ({
    page,
  }) => {
    const earth = await earthOf(page);
    const worlds = await climatesOf(page);
    const greener = worlds.flatMap(
      ({
        climate: {
          bands: [tropics, middle],
        },
      }) => (tropics.lab === null || middle.lab === null ? [] : [hueOf(middle.lab) - hueOf(tropics.lab)]),
    );
    const read = {
      greener: quantile(greener, 0.5),
      drier: correlation(worlds.map(({ climate, minor }) => [minor, 1 - climate.green] as const)),
      colder: correlation(
        worlds.flatMap(({ climate: { bands }, caps }) =>
          bands[1].lab === null ? [] : [[caps, 1 - bands[1].green] as const],
        ),
      ),
    };
    test.info().annotations.push({ type: "climates", description: JSON.stringify({ earth: earth.map, read, worlds }) });
    expect(greener.length, "worlds showing both bands").toBeGreaterThanOrEqual(48);
    expect(read.greener, "deserts about the tropics, greener between").toBeGreaterThanOrEqual(GREENER);
    expect(read.drier, "a drier seed, barer land").toBeGreaterThanOrEqual(TILT.drier);
    expect(read.colder, "a colder seed, barer between").toBeGreaterThanOrEqual(TILT.colder);
  });

  test("a temperate world's land is the Earth's own hues, low-key: no more saturated than the Earth's or frame 4's worlds", async ({
    page,
  }) => {
    const earth = await earthOf(page);
    const lands = (await climatesOf(page)).flatMap(({ climate: { land, chroma } }) =>
      land === null ? [] : [{ hue: hueOf(land), chroma }],
    );
    const [hues, chromas] = [lands.map(({ hue }) => hue), lands.map(({ chroma }) => chroma)];
    const read = {
      spread: quantile(hues, 0.9) - quantile(hues, 0.1),
      median: quantile(chromas, 0.5),
      least: Math.min(...chromas),
      most: Math.max(...chromas),
    };
    test
      .info()
      .annotations.push({ type: "colours", description: JSON.stringify({ earth: earth.chroma, read, lands }) });
    expect(lands.length, "worlds with land in full light").toBeGreaterThanOrEqual(ENOUGH);
    for (const [at, hue] of hues.entries()) {
      expect(hue, `world ${String(at)}: the Earth's hues`).toBeGreaterThanOrEqual(HUES.range[0]);
      expect(hue, `world ${String(at)}: the Earth's hues`).toBeLessThanOrEqual(HUES.range[1]);
    }
    expect(read.spread, "spread over the Earth's hues").toBeGreaterThanOrEqual(HUES.spread);
    expect(read.least, "never grey").toBeGreaterThanOrEqual(HUES.grey);
    expect(read.median, "the Earth's own saturation").toBeLessThanOrEqual(earth.chroma * SATURATION.forestOverDesert);
    expect(read.most, "under frame 4's worlds").toBeLessThanOrEqual(SATURATION.frame4);
  });
});
