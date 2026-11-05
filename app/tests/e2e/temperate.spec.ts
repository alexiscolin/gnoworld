// Temperate worlds varied and real at the coast (slice 7, 7b8; Alexis, 2026-11-03, docs/decisions.md): sharp coasts with their islands
// and a thin shelf, shapes from the seed, climates by latitude, natural low-key colours, each read on 64 seeds or more (the lab's paths,
// a hash each, never a chosen few), the Earth's own number beside it (its view at realism.spec's instant at a close world's zoom; its day
// map, unlit, by latitude). Each main bound failed on 81e07949, whose numbers the comments give; "held" marks one that passed there too.

import { ANCHORS, asciiBytes, planetSeed, type Surface } from "@gnoworld/core";
import { climatesOn, mapClimateOn, type Climate, type Pole } from "./climates.ts";
import { shoresOn, type Shore } from "./coasts.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { askLab, circles, EARTH_INSTANT, EARTH_VIEW, heldQuiet, open, picture, type Circle } from "./lab.ts";
import { landDetailsOn, type LandDetail } from "./landDetail.ts";
import { seaLightsOn } from "./seaLight.ts";
import { facesApart, facesOn, GLANCE, type Face } from "./textures.ts";
import { starWarmth } from "../../../packages/core/src/cosmos/warmth.ts";
import { plantsOf } from "../../../packages/core/src/planet/recipe.ts";
import { ROWS } from "../../../packages/core/src/planet/rows.ts";
import { sha256 } from "../../../packages/core/src/planet/sha256.ts";
import { correlation } from "../../../packages/core/src/testing.ts";

// Coasts at a close world's zoom (radius 350 px, the Earth's view 356), the median world's: the coast's length over its smoothed copy's,
// the Earth's 3.93 (81e07949: 0.44 to 0.50 of it), never past 1.6 times it (speckle); islands per continent, the Earth's 4 (0.08 to 0.35).
const COAST = { jagged: [0.6, 1.6], islands: 0.5 } as const;
// The sea's lift past a coast, in L*, the worlds' mean (coasts.ts's Shore): no wide halo, the Earth's -1.5 (81e07949: 1.9 to 2.5); a thin
// shelf (held, 1.9 to 2.6 there; the Earth's view -0.1, its shelves under a pixel at this zoom).
const SEA = { halo: 1, shelf: 0.35 } as const;
// Shapes on the classes' view without clouds, each world lit from the eye (its whole face; 24 worlds a seed, 94 px of radius): the largest
// piece's share of the land, 81e07949's median 0.76 and tenth 0.38 (its "one shape"); no longer near it, small on a tenth, whole on another.
const LARGEST = { median: 0.68, low: 0.33, high: 0.85 } as const;
// The drawn land follows the seed's (1 - sea): the slope of one on the other 0.46 on 81e07949, its mean 0.053 under the seeds'.
const FOLLOWS = { slope: 0.6, mean: 0.04 } as const;
// Held there: one piece of 0.9 on a tenth, several continents of a size (the second 0.4 of the first) on a sixth, an archipelago of
// eight pieces on a tenth, 7b6's land and sea (F4243), no world all sea.
const HELD = { whole: 0.9, families: [0.1, 1 / 6, 0.1], pieces: 8, land: [0.3, 0.6], allSea: 0.05 } as const;
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
// The Earth's plains (the design review, high and medium): its view's green land 13.2 L* over its sea, its map's land 54% green; the
// median world's green land half as much over its sea at least, and as green within three quarters (914df134: 2.4 L* and 33%).
const PLAINS = { lighter: 0.5, green: 0.75 } as const;
// Never the Earth (7b7; Alexis, 2026-11-03, 16:4x), its coasts and shapes now compared too, at its own zoom: a world reads apart by its
// sea, its land or its clouds a glance off (textures.ts's GLANCE), or its coast or its shape a quarter off the Earth's.
const SHAPE_APART = 0.25;
// The land's own fine detail off its coasts and clouds (the chief, 2026-11-03: the interiors lost theirs), on seeds 0 to 5 close, each:
// its energy and its finest share at least 0.8 of the Earth's land where the day box reads it (southern India, 175 and 0.50), as the day
// box's own share (generated.spec); b9379cef: 54, 45, 87 and 103 on seeds 0, 2, 3 and 5.
const LAND_DETAIL = { share: 0.8, seeds: 6, blocks: 500 } as const;
// The lit sea as the Earth's (the chief, 2026-11-04: "the seas are near black", the lands pasted on them): on seeds 0 to 7 close, the sea
// of the lit half, its median within a sixth of the Earth's lightness there (19.2 L*) and a colour, half its chroma (25.0) at least;
// 35de26ea: 15.1 L* and 8.3. Alexis's teal keeps its hue: "never the Earth" reads it with the coasts.
const LIT_SEA = { seeds: 8, lightness: 1 / 6, chroma: 0.5 } as const;
const WORLD = ANCHORS.indexOf("temperate");
const PARTS = 4;
const PER_PART = 16;
const VIEWS = 3;
const ENOUGH = 64;

const quantile = (values: readonly number[], at: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(at * values.length))] ?? 0;
const hueOf = ([, a, b]: readonly number[]) => (Math.atan2(b ?? 0, a ?? 0) * 180) / Math.PI;
// Whether a world of the lab grows the Earth's plants, not its star's other ones (7b9; Alexis, 2026-11-03, "Les deux, surtout naturel"):
// what reads the Earth's greens, or land and sea apart by colour, reads those; every world keeps the low-key bounds.
const earthPlants = (path: string) =>
  plantsOf(sha256(planetSeed(asciiBytes(path))), "temperate", starWarmth(path.split("/")[2] ?? "")) ===
  ROWS.temperate.palettes;

interface Earth {
  readonly shore: Shore;
  readonly face: Face;
  readonly chroma: number;
  readonly map: Climate;
  readonly land: LandDetail;
  /** Its view's green land's L* over its sea's. */
  readonly greenOverSea: number;
  /** Its lit half's sea, in Lab (seaLight.ts). */
  readonly sea: readonly [number, number, number];
}
// The Earth's measures, once a worker: its view is the same on every visit, its map one file.
let earthRead: Earth | undefined;
async function earthOf(page: Page): Promise<Earth> {
  if (earthRead !== undefined) return earthRead;
  await page.clock.setFixedTime(EARTH_INSTANT);
  await open(page, "?view=earth");
  const shot = await picture(page);
  const [[shore], [face], [lit], [land], [sea]] = [
    await shoresOn(page, shot, [EARTH_VIEW]),
    await facesOn(page, shot, [EARTH_VIEW]),
    await climatesOn(page, shot, [[EARTH_VIEW, [0, 1, 0]]]),
    await landDetailsOn(page, shot, [[EARTH_VIEW, true]]),
    await seaLightsOn(page, shot, [EARTH_VIEW]),
  ];
  const map = await mapClimateOn(page, await (await page.request.get("/textures/earth-day.webp")).body());
  if (shore === undefined || face === undefined || lit === undefined || land === undefined) throw new Error("no Earth");
  if (lit.greenLight === null || face.sea === null || !sea) throw new Error("no green land or sea on the Earth");
  earthRead = { shore, face, chroma: lit.chroma, map, land, greenOverSea: lit.greenLight - face.sea[0], sea };
  return earthRead;
}

/** The classes' view of temperate worlds at three seeds, without clouds: 72 worlds, each with its place, its pole, its surface, its
 * minor's share and whether it grows the Earth's plants. */
async function classViews(page: Page, light = "") {
  const views: {
    shot: Buffer;
    places: Circle[];
    poles: Pole[];
    surfaces: Surface[];
    minors: number[];
    earth: boolean[];
  }[] = [];
  for (let seed = 0; seed < VIEWS; seed += 1) {
    await open(page, `?view=class24&world=${String(WORLD)}&clouds=off${light}&seed=${String(seed)}`);
    const view = {
      shot: await picture(page),
      places: await circles(page),
      poles: await askLab<Pole[]>(page, "poles"),
      surfaces: await askLab<Surface[]>(page, "surfaces"),
      minors: await askLab<number[]>(page, "minors"),
      earth: (await askLab<string[]>(page, "paths")).map(earthPlants),
    };
    expect(
      [view.poles.length, view.surfaces.length, view.minors.length, view.earth.length],
      "a pole, a surface, a minor, plants a world",
    ).toEqual(Array.from({ length: 4 }, () => view.places.length));
    views.push(view);
  }
  return views;
}

const climatesOf = async (page: Page) =>
  (
    await Promise.all(
      (await classViews(page)).map(async ({ shot, places, poles, surfaces, minors, earth }) => {
        const faces = await facesOn(page, shot, places);
        return (
          await climatesOn(
            page,
            shot,
            places.map((place, at) => [place, poles[at] ?? [0, 0, 0]] as const),
          )
        ).map((climate, at) => ({
          climate,
          sea: faces[at]?.sea ?? null,
          caps: surfaces[at]?.caps ?? 0,
          minor: minors[at] ?? 0,
          earth: earth[at] ?? true,
        }));
      }),
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
      // Sixteen worlds of the Earth's plants from its first seed on, the others' land read apart (7b9): within twice as many seeds.
      for (let seed = part * PER_PART; shores.length < PER_PART && seed < (part + 2) * PER_PART; seed += 1) {
        await open(page, `?view=close&world=${String(WORLD)}&seed=${String(seed)}`);
        if (!(await askLab<string[]>(page, "paths")).every(earthPlants)) continue;
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
        halo: mean(shores.flatMap(({ halo }) => halo ?? [])),
        shelf: mean(shores.flatMap(({ shelf }) => shelf ?? [])),
      };
      test
        .info()
        .annotations.push({ type: "coasts", description: JSON.stringify({ earth: earth.shore, read, shores }) });
      expect(shores, "worlds read").toHaveLength(PER_PART);
      expect(shores.filter(({ halo }) => halo !== null).length, "seas read near a coast").toBeGreaterThanOrEqual(
        PER_PART / 2,
      );
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

  test("a temperate world's land holds the Earth's fine detail off its coasts, on six seeds, each", async ({
    page,
  }) => {
    const { land: earth } = await earthOf(page);
    expect(earth.blocks, "the Earth's land in its day box").toBeGreaterThanOrEqual(LAND_DETAIL.blocks);
    const read: LandDetail[] = [];
    for (let seed = 0; seed < LAND_DETAIL.seeds; seed += 1) {
      await open(page, `?view=close&world=${String(WORLD)}&seed=${String(seed)}`);
      const [place] = await circles(page);
      if (place === undefined) throw new Error("no world");
      read.push(...(await landDetailsOn(page, await picture(page), [[place, false]])));
    }
    test.info().annotations.push({ type: "land", description: JSON.stringify({ earth, read }) });
    for (const [seed, land] of read.entries()) {
      expect(land.blocks, `seed ${String(seed)}: land to read`).toBeGreaterThanOrEqual(LAND_DETAIL.blocks);
      expect(land.energy, `seed ${String(seed)}: the Earth's fine detail`).toBeGreaterThanOrEqual(
        LAND_DETAIL.share * earth.energy,
      );
      expect(land.sharpness, `seed ${String(seed)}: as sharp`).toBeGreaterThanOrEqual(
        LAND_DETAIL.share * earth.sharpness,
      );
    }
  });

  test("a temperate world's lit sea is as light as the Earth's, in its own teal, never a dark hole", async ({
    page,
  }) => {
    const { sea: earth } = await earthOf(page);
    const read: (readonly [number, number, number])[] = [];
    for (let seed = 0; seed < LIT_SEA.seeds; seed += 1) {
      await open(page, `?view=close&world=${String(WORLD)}&seed=${String(seed)}`);
      const [place] = await circles(page);
      if (place === undefined) throw new Error("no world");
      const [sea] = await seaLightsOn(page, await picture(page), [place]);
      if (sea) read.push(sea);
    }
    const lightness = quantile(
      read.map(([l]) => l),
      0.5,
    );
    const chroma = quantile(
      read.map(([, a, b]) => Math.hypot(a, b)),
      0.5,
    );
    test.info().annotations.push({ type: "sea", description: JSON.stringify({ earth, read, lightness, chroma }) });
    expect(read.length, "seas read").toBeGreaterThanOrEqual(LIT_SEA.seeds - 1);
    expect(Math.abs(lightness / earth[0] - 1), "as light as the Earth's lit sea").toBeLessThanOrEqual(
      LIT_SEA.lightness,
    );
    expect(chroma, "a sea's colour, never a grey hole").toBeGreaterThanOrEqual(
      LIT_SEA.chroma * Math.hypot(earth[1], earth[2]),
    );
  });

  test("temperate worlds take every shape from their seed: one supercontinent, several continents, an archipelago", async ({
    page,
  }) => {
    const earth = await earthOf(page);
    const views = await classViews(page, "&light=front");
    const shores = (
      await Promise.all(
        views.map(async ({ shot, places, earth }) => (await shoresOn(page, shot, places)).filter((_, at) => earth[at])),
      )
    ).flat();
    const seas = views.flatMap(({ surfaces, earth }) =>
      surfaces.filter((_, at) => earth[at]).map(({ sea }) => 1 - sea),
    );
    const largest = shores.map(({ pieces }) => pieces[0] ?? 0);
    const share = (count: number) => count / shores.length;
    const drawn = shores.map((shore) => shore.share);
    const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const spread = (values: readonly number[]) => mean(values.map((value) => (value - mean(values)) ** 2));
    const read = {
      largest: [quantile(largest, 0.1), quantile(largest, 0.5), quantile(largest, 0.9)],
      slope:
        (correlation(seas.map((sea, at) => [sea, drawn[at] ?? 0] as const)) * Math.sqrt(spread(drawn))) /
        Math.sqrt(spread(seas)),
      mean: mean(drawn) - mean(seas),
      families: [
        share(largest.filter((one) => one >= HELD.whole).length),
        share(shores.filter(({ pieces: [first = 0, second = 0] }) => second >= 0.4 * first).length),
        share(shores.filter(({ pieces }) => pieces.length >= HELD.pieces).length),
      ],
      land: quantile(drawn, 0.5),
    };
    test
      .info()
      .annotations.push({ type: "shapes", description: JSON.stringify({ earth: earth.shore, read, shores, seas }) });
    expect(views.flatMap(({ places }) => places).length, "worlds read").toBeGreaterThanOrEqual(ENOUGH);
    expect(read.largest[1], "the largest piece no longer near one shape").toBeLessThanOrEqual(LARGEST.median);
    expect(read.largest[0], "small on some").toBeLessThanOrEqual(LARGEST.low);
    expect(read.largest[2], "nearly the whole land on others").toBeGreaterThanOrEqual(LARGEST.high);
    expect(read.slope, "the drawn land follows the seed's").toBeGreaterThanOrEqual(FOLLOWS.slope);
    expect(Math.abs(read.mean), "as much land as the seeds give").toBeLessThanOrEqual(FOLLOWS.mean);
    for (const [at, family] of read.families.entries())
      expect(family, `one piece, several, an archipelago: ${String(at)}`).toBeGreaterThanOrEqual(
        HELD.families[at] ?? 1,
      );
    expect(read.land, "land").toBeGreaterThanOrEqual(HELD.land[0]);
    expect(read.land, "and sea").toBeLessThanOrEqual(HELD.land[1]);
    for (const [at, shore] of shores.entries())
      expect(shore.share, `world ${String(at)}: some land`).toBeGreaterThan(HELD.allSea);
  });

  test("a temperate world's land follows its latitude and its seed: deserts about the tropics, greener between, barer dry or cold", async ({
    page,
  }) => {
    const earth = await earthOf(page);
    const worlds = (await climatesOf(page)).filter(({ earth }) => earth);
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

  test("a temperate world's plains are green as the Earth's and lighter than its sea, never lost in it", async ({
    page,
  }) => {
    const earth = await earthOf(page);
    const worlds = (await climatesOf(page)).filter(({ earth }) => earth);
    const lighter = worlds.flatMap(({ climate: { greenLight }, sea }) =>
      greenLight === null || sea === null ? [] : [greenLight - sea[0]],
    );
    const read = {
      lighter: quantile(lighter, 0.5),
      green: quantile(
        worlds.map(({ climate }) => climate.green),
        0.5,
      ),
    };
    test.info().annotations.push({
      type: "plains",
      description: JSON.stringify({
        earth: { greenOverSea: earth.greenOverSea, green: earth.map.green },
        read,
        lighter,
      }),
    });
    expect(lighter.length, "worlds showing green land and sea").toBeGreaterThanOrEqual(48);
    expect(read.lighter, "green land lighter than its sea").toBeGreaterThanOrEqual(PLAINS.lighter * earth.greenOverSea);
    expect(read.green, "land as green as the Earth's").toBeGreaterThanOrEqual(PLAINS.green * earth.map.green);
  });

  test("a temperate world's land is the Earth's own hues, low-key: no more saturated than the Earth's or frame 4's worlds", async ({
    page,
  }) => {
    const earth = await earthOf(page);
    const lands = (await climatesOf(page)).flatMap(({ climate: { land, chroma }, earth }) =>
      land === null ? [] : [{ hue: hueOf(land), chroma, earth }],
    );
    const earths = lands.filter(({ earth }) => earth);
    const [hues, chromas] = [earths.map(({ hue }) => hue), lands.map(({ chroma }) => chroma)];
    const read = {
      spread: quantile(hues, 0.9) - quantile(hues, 0.1),
      median: quantile(chromas, 0.5),
      least: Math.min(...earths.map(({ chroma }) => chroma)),
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
