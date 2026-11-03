import { ANCHORS, SURFACE, worldLook, type Lab } from "@gnoworld/core";
import { expect, test, type Page } from "./fixtures.ts";
import { askLab, circles, COMPUTER, listen, looks, noneOnAnother, open, picture, stats, type Circle } from "./lab.ts";
import { glows } from "./pixels.ts";
import {
  alikeOnScreen,
  alikePairs,
  apart,
  details,
  portraits,
  textureSpread,
  type Detail,
  type Portrait,
} from "./portraits.ts";

// Every world but the Earth, generated (slice 7, 7b5; Alexis, 2026-11-02: "toutes à part la Terre doivent être art générées avec le même
// niveau de détail et fidélité"). What a software GPU proves on the lab; SwiftShader's picture is never the verdict on beauty.
const VIEW_OF_24 = 24;
// Core's golden allows two alike pairs in any view of 40 (server/src/worlds/group.test.ts); a view of 24 holds fewer pairs, so two.
const ALIKE_AT_MOST = 2;
// Close views at the Earth's size: the finest scale's share of a world's detail over the next scale's at least 80% of the Earth's, and
// under what grain shows (white noise reads 4; the crispest rendered ground, nitrogen ice's craters, 2.1); the detail at least four
// times the Laplacian variance 8-bit rounding gives a featureless disc (2.3, measured on the base's cloud deck).
const DETAIL_SHARE = 0.8;
const GRAIN = 3;
const ROUNDING = 2.3;
// The volcanic character Alexis approved (2026-11-02), a dark crust with white-hot vents red at their edges, as the approved lab measures
// it (41776567, pixels.ts's glows): the gallery's 6.05% white-hot and 4.56% red, the close view's 3.87% and 3.24%, nothing pale. Its
// style's median holds in that span, red over white-hot within half and twice theirs (0.75, 0.84).
const APPROVED_HOT = [0.0387, 0.0605] as const;
const APPROVED_RED_OVER_HOT = [0.75, 0.84] as const;
const PALE_AT_MOST = 0.01;
// The veins of the video's frame 4 "Music" world (f0004.jpg, its disc at 1254, 771, radius 36; pixels.ts's glows): 55.2% of its disc,
// 62.8% of its night half; its brightest pixels gold (blue 0.57 of red), never white. A veined world holds half of each at least.
const MUSIC = [0.552, 0.628] as const;
const NEVER_WHITE = 0.005;
// Io's sulfur crust as the chief described it, yellow to orange and bright, a few hot spots: set from that description, no image of Io
// measured. Lab hue of the lit ground in degrees, its chroma, its lightness, and its white share at most (lit sulfur is bright, not white).
const SULFUR = { hue: [55, 100], chroma: 25, lightness: 35, white: 0.01 } as const;
// The instant realism.spec pins the Earth at: its detail is measured on that same picture.
const INSTANT = Date.UTC(2026, 10, 2, 3, 0, 0);
// What the hand-made Earth's view draws: earthView.ts's circle, a third of the screen's height at its centre.
const EARTH_CIRCLE: Circle = { x: COMPUTER.width / 2, y: COMPUTER.height / 2, r: COMPUTER.height * 0.33 };
// A real map lends its fine contrast only: with every map grey, a world's 8-pixel blocks move a tenth of its lightness at most.
const BLOCKS_MOVE = 0.1;
// A class's colour reads from afar on three discs of four at least: its minor takes 40% of a world, and may face the eye.
const READ_AS_CLASS = 18;
const SAME_HUE = Math.PI / 4;
const GREY = 12;
const FRAMES = 3;
const MAPS_AT_MOST = 11;
const PROGRAMS_AT_MOST = 4;

const classView = (anchor: number) => `?view=class24&world=${String(anchor)}`;
const portraitsOf = async (page: Page) => portraits(page, await picture(page), await circles(page));
// A disc lit enough to judge has a picture and a texture; a dark world's night can leave too few pixels lit to read either.
const LIT_TO_JUDGE = 200;
const nonDegenerate = (all: readonly Portrait[]) => {
  expect(all.filter(({ lit }) => lit >= LIT_TO_JUDGE).length, "most discs are lit enough to read").toBeGreaterThan(
    all.length / 2,
  );
  for (const [index, one] of all.entries()) {
    if (one.lit < LIT_TO_JUDGE) continue;
    expect(one.spread, `disc ${String(index)} has a picture`).toBeGreaterThan(0);
    for (const energy of one.energy.slice(0, 2))
      expect(energy, `disc ${String(index)} has fine texture`).toBeGreaterThan(0);
  }
};
const hue = ([, a, b]: readonly number[]) => Math.atan2(b ?? 0, a ?? 0);
const chroma = ([, a, b]: readonly number[]) => Math.hypot(a ?? 0, b ?? 0);
const turned = (one: number, other: number) => Math.abs(Math.atan2(Math.sin(one - other), Math.cos(one - other)));

// The Earth's detail, measured once a worker: its view is the same on every visit.
let earthDetail: Detail | undefined;
const earthOf = async (page: Page): Promise<Detail> => {
  if (earthDetail !== undefined) return earthDetail;
  await page.clock.setFixedTime(INSTANT);
  await open(page, "?view=earth");
  const [day, night] = await details(page, await picture(page), [
    EARTH_CIRCLE,
    { ...EARTH_CIRCLE, x: EARTH_CIRCLE.x - 0.6 * EARTH_CIRCLE.r },
  ]);
  if (day === undefined || night === undefined) throw new Error("no Earth");
  expect(day.luma, "the Earth's box lies on its lit side").toBeGreaterThan(night.luma + 10);
  earthDetail = day;
  return day;
};

const closeDetail = async (page: Page, query: string) => {
  const earth = await earthOf(page);
  await open(page, query);
  const [place] = await circles(page);
  if (place === undefined) throw new Error("no world");
  expect(Math.abs(place.r / EARTH_CIRCLE.r - 1), "the Earth's size on screen").toBeLessThan(0.03);
  const [day] = await details(page, await picture(page), [place]);
  if (day === undefined) throw new Error("no measure");
  test.info().annotations.push({
    type: "detail",
    description: JSON.stringify({ day, earth, raw: day.variance / earth.variance }),
  });
  expect(day.sharpness, "as sharp as the Earth").toBeGreaterThanOrEqual(earth.sharpness * DETAIL_SHARE);
  expect(day.sharpness, "no grain").toBeLessThanOrEqual(GRAIN);
  expect(day.variance, "detail, not rounding").toBeGreaterThan(4 * ROUNDING);
};

// The real file's 24, read once a worker: the lab's own choice of them, which `real=` must follow.
let recorded: string[] | undefined;
const realIds = async (page: Page) => {
  if (recorded !== undefined) return recorded;
  await open(page, "?view=real24");
  recorded = await askLab<string[]>(page, "ids");
  return recorded;
};

test.describe("generated worlds", () => {
  test.slow();

  const wrong: string[] = [];
  const asked: string[] = [];
  test.beforeEach(({ page }) => {
    wrong.length = 0;
    asked.length = 0;
    listen(page, wrong);
    page.on("request", (request) => asked.push(request.url()));
  });
  test.afterEach(() => {
    expect(wrong, "the console").toEqual([]);
  });

  test("24 worlds of the real file, each the class the site gives it, of several kinds, all in frame and none on another", async ({
    page,
  }) => {
    const ids = await realIds(page);
    expect((await stats(page)).worlds).toBe(VIEW_OF_24);
    expect(new Set(ids).size).toBe(VIEW_OF_24);
    const anchors = (await looks(page)).map(({ anchor }) => anchor);
    expect(anchors).toEqual(ids.map((id) => worldLook(id).anchor));
    expect(new Set(anchors).size, "several classes").toBeGreaterThan(8);
    noneOnAnother(await circles(page), 40);
  });

  test("no two of the real file's 24 read as one on the screen, and no generated world asks for the Earth's map", async ({
    page,
  }) => {
    await open(page, "?view=real24");
    const all = await portraitsOf(page);
    nonDegenerate(all);
    const pairs = alikePairs(all);
    expect(pairs.length, JSON.stringify(pairs)).toBeLessThanOrEqual(ALIKE_AT_MOST);
    expect(
      asked.filter((url) => url.includes("earth-day")),
      "F4223",
    ).toEqual([]);
  });

  // The measure's control: each world drawn twice reads as itself, or a bound on alike pairs would hold for nothing.
  test("a view drawn twice reads, world by world, as itself", async ({ page }) => {
    await open(page, classView(ANCHORS.indexOf("desert")));
    const once = await portraitsOf(page);
    await open(page, classView(ANCHORS.indexOf("desert")));
    const twice = await portraitsOf(page);
    expect(once.filter((portrait, at) => alikeOnScreen(portrait, twice[at] ?? portrait)).length).toBe(VIEW_OF_24);
  });

  // ADR-0002 §3 bounds alike neighbours on the real list (above); 24 worlds of one class never meet in the cosmos, so how many of them read
  // as one, and how far their textures spread, are reported for Alexis's eye (which families still repeat), not held. The volcanic class
  // reads by its styles' marks instead (below): its dark palette asks a grey disc no glowing crust gives, the approved one included.
  for (const [index, anchor] of ANCHORS.entries())
    if (anchor !== "volcanic")
      test(`24 ${anchor} worlds read as their class, each lit enough to read`, async ({ page }) => {
        await open(page, classView(index));
        expect(new Set((await looks(page)).map((look) => look.anchor))).toEqual(new Set([anchor]));
        const all = await portraitsOf(page);
        nonDegenerate(all);
        const mids = await askLab<Lab[]>(page, "mids");
        const reading = all.filter(({ lab }, at) => {
          const mid = mids[at] ?? [0, 0, 0];
          return chroma(mid) < GREY ? chroma(lab) < GREY * 2 : turned(hue(lab), hue(mid)) < SAME_HUE;
        });
        expect(reading.length, `${anchor} reads as its own palette`).toBeGreaterThanOrEqual(READ_AS_CLASS);
        const [alike, spread] = [alikePairs(all).length, textureSpread(all)];
        test.info().annotations.push({ type: "variety", description: JSON.stringify({ anchor, alike, spread }) });
      });

  // The dominant reads from afar (ADR-0002 §3): taken out, the minor moves on the whole no more than it holds, and nothing where it barely shows.
  for (const anchor of ["desert", "gas giant", "rocky"] as const)
    test(`a ${anchor} world keeps 60% of itself to its own class, its minor the rest`, async ({ page }) => {
      const query = classView(ANCHORS.indexOf(anchor));
      await open(page, `${query}&minor=off`);
      const places = await circles(page);
      const plain = await picture(page);
      await open(page, query);
      const moves = await apart(page, [plain, await picture(page)], places);
      const minors = await askLab<number[]>(page, "minors");
      const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
      expect(mean(moves.map(({ moved }) => moved))).toBeLessThanOrEqual(mean(minors) + 0.05);
      // A minor that barely shows moves little: its regions may lie on the side the eye sees, so twice its share at most.
      for (const [at, { moved }] of moves.entries())
        if ((minors[at] ?? 0) < 0.02)
          expect(moved, `world ${String(at)}`).toBeLessThanOrEqual(2.5 * (minors[at] ?? 0) + 0.02);
      expect(moves.filter(({ moved }) => moved > 0.1).length, "some worlds show their minor").toBeGreaterThan(
        VIEW_OF_24 / 4,
      );
    });

  // The volcanic styles (Alexis through the chief, 2026-11-03: "on peut avoir plusieurs styles"), each read on its own discs.
  test("24 volcanic worlds show each of their three styles, each with its own mark, none with a pale blob", async ({
    page,
  }) => {
    await open(page, classView(ANCHORS.indexOf("volcanic")));
    const [shot, places] = [await picture(page), await circles(page)];
    nonDegenerate(await portraits(page, shot, places));
    const shares = await glows(page, shot, places);
    const styles = await askLab<number[]>(page, "styles");
    expect(shares).toHaveLength(VIEW_OF_24);
    expect(new Set(styles)).toEqual(new Set([0, 1, 2]));
    test.info().annotations.push({
      type: "styles",
      description: JSON.stringify(shares.map((share, at) => ({ ...share, style: styles[at] }))),
    });
    const of = (style: number) => shares.filter((_, at) => styles[at] === style);
    const vents = of(0);
    const hot = vents.map((share) => share.hot).sort((one, other) => one - other);
    const median = ((hot[Math.floor((hot.length - 1) / 2)] ?? 0) + (hot[Math.ceil((hot.length - 1) / 2)] ?? 0)) / 2;
    expect(median, "the approved crust's white-hot share").toBeGreaterThanOrEqual(APPROVED_HOT[0]);
    expect(median, "the approved crust's white-hot share").toBeLessThanOrEqual(APPROVED_HOT[1]);
    const sum = (key: "hot" | "red") => vents.reduce((total, share) => total + share[key], 0);
    expect(sum("red") / sum("hot"), "red edges round white cores").toBeGreaterThanOrEqual(APPROVED_RED_OVER_HOT[0] / 2);
    expect(sum("red") / sum("hot"), "red edges round white cores").toBeLessThanOrEqual(APPROVED_RED_OVER_HOT[1] * 2);
    for (const veins of of(1)) {
      expect(veins.glow, "veins over the disc").toBeGreaterThanOrEqual(MUSIC[0] / 2);
      expect(veins.night, "veins on the night side").toBeGreaterThanOrEqual(MUSIC[1] / 2);
      expect(veins.white, "gold, never white").toBeLessThanOrEqual(NEVER_WHITE);
    }
    for (const sulfur of of(2)) {
      const [lightness, a, b] = sulfur.lab;
      const hue = (Math.atan2(b, a) * 180) / Math.PI;
      expect(hue, "sulfur's yellow to orange").toBeGreaterThanOrEqual(SULFUR.hue[0]);
      expect(hue, "sulfur's yellow to orange").toBeLessThanOrEqual(SULFUR.hue[1]);
      expect(Math.hypot(a, b), "sulfur's colour").toBeGreaterThanOrEqual(SULFUR.chroma);
      expect(lightness, "a bright crust").toBeGreaterThanOrEqual(SULFUR.lightness);
      expect(sulfur.white, "a few hot spots, no white-hot crust").toBeLessThanOrEqual(SULFUR.white);
    }
    for (const [at, { pale }] of shares.entries())
      expect(pale, `world ${String(at)}: nothing pale`).toBeLessThanOrEqual(PALE_AT_MOST);
  });

  test("a real map lends its fine contrast only: with every map grey, a world keeps its shapes", async ({ page }) => {
    await open(page, "?view=real24&maps=flat");
    const places = await circles(page);
    const flat = await picture(page);
    await open(page, "?view=real24");
    for (const [at, { blocks, fine }] of (await apart(page, [flat, await picture(page)], places)).entries()) {
      expect(blocks, `world ${String(at)}`).toBeLessThanOrEqual(BLOCKS_MOVE);
      expect(fine, `world ${String(at)}`).toBeGreaterThan(blocks);
    }
  });

  // F4218: a value the recipe gives that no pixel reads is left out of the program by its compiler, so a live uniform is a read one.
  test("reads every value of the recipe and the look it is handed: each is a live uniform of the program", async ({
    page,
  }) => {
    await open(page, "?view=real24");
    const live = new Set(await askLab<string[]>(page, "live"));
    const named = [
      ...[...Object.keys(SURFACE), "octaves"].map((name) => `shape.${name}`),
      ...["low", "mid", "high", "minorLow", "minorMid", "minorHigh", "minorShare", "minorMap", "offset", "minorOffset"],
      ...[
        "banded",
        "recolour",
        "relief",
        "warpAmount",
        "warpFrequency",
        "seaShallow",
        "seaDeep",
        "glowColour",
        "glowLevel",
        "locked",
      ],
    ];
    for (const name of named) expect(live, name).toContain(name);
  });

  for (const index of ANCHORS.keys())
    test(`a ${ANCHORS[index] ?? ""} world seen close holds the Earth's fine detail`, async ({ page }) => {
      await closeDetail(page, `?view=close&world=${String(index)}`);
    });

  for (let index = 0; index < VIEW_OF_24; index += 1)
    test(`the real file's world ${String(index)} seen close holds the Earth's fine detail`, async ({ page }) => {
      const id = (await realIds(page))[index];
      await closeDetail(page, `?view=close&real=${String(index)}`);
      expect(await askLab<string[]>(page, "ids")).toEqual([id]);
    });

  for (const query of ["real=", "real=-1", "real=99", "real=1e9", "real=abc", "real=__proto__", "tier=x", "minor=x"])
    test(`a lab asked for "${query}" falls back to its own view`, async ({ page }) => {
      await open(page, `?view=close&world=2&${query}`);
      expect((await looks(page)).map(({ anchor }) => anchor)).toEqual([ANCHORS[2]]);
      expect(await askLab<(string | null)[]>(page, "ids")).toEqual([null]);
    });

  // ADR-0002 §3's variety view: eight classes in frame (no wonder exists before 7-after), on the few programs and maps every world shares.
  // Its frame's cost is read beside the Earth's at both pixel ratios and reported, not held: on SwiftShader four times the pixels did not
  // cost one and a half times as much (7b5's report), so a software GPU cannot judge a GPU's budget; the lab's C key reads it on one.
  test.describe("ADR-0002 §3's variety view, at a computer's two pixel ratios", () => {
    test.use({ deviceScaleFactor: 2 });

    const costOf = async (page: Page, query: string) => {
      await open(page, query);
      return askLab<number>(page, "cost", FRAMES);
    };

    test("eight classes in frame on a few shared programs and maps, their cost read beside the Earth's", async ({
      page,
    }) => {
      // Four views at twice the pixels on a software GPU: past 90 s when four journeys share the machine (7b5's full runs).
      test.setTimeout(240_000);
      const read: Record<string, number[]> = {};
      for (const tier of ["high", "low"])
        for (const view of ["earth", "variety"])
          read[`${view} ${tier}`] = [await costOf(page, `?view=${view}&tier=${tier}`)];
      const found = await stats(page);
      expect(found.worlds).toBe(8);
      expect(new Set((await looks(page)).map((look) => look.anchor)).size).toBe(8);
      expect(found.programs).toBeLessThanOrEqual(PROGRAMS_AT_MOST);
      expect(found.textures).toBeLessThanOrEqual(MAPS_AT_MOST);
      test.info().annotations.push({ type: "frame, ms", description: JSON.stringify(read) });
    });
  });
});
