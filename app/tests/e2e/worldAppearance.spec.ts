// A world's appearance on this reader's first visit (Alexis, 2026-11-03; frames 20, 21 and 102 to 105, one a second): once the world rests,
// a band of light runs down it from its north pole and draws a grid of meridians and parallels behind it, which then fades. The device keeps
// the visit, so a reload plays none; under reduced motion a still grid shows and fades. On the gate's software GPU, with the page's clock
// held and moved a frame at a time: the canvas is read for the band and the grid's lines, never compared with the frames; its pictures at
// each step are attached for the design review.
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { reading, type Tools } from "./pixels.ts";
import { held, landed, running, stats } from "./sceneStage.ts";

const COMPUTER = { width: 1728, height: 1080 };
const SLOW = { timeout: 150_000 };
const FRAME_MS = 16;
// Frame 103's band, measured on its night side: at 585 px, the disc's centre at 565 and its radius 326, so just under the equator.
const FRAME_103_BAND = -0.06;
// Frame 20's GovDAO: the band under the north cap's grid.
const FRAME_20_BAND = 0.7;
// Frame 104 is a second after 103: the band gone, the grid fading but strong.
const FRAME_104_GRID = 0.8;
// The band off the world, before it comes and once it has gone: past a pole by more than its glow; where it starts and ends.
const OFF = 1.3;
const BAND_REACH = 1.4;
// Frames 103's and 104's lines on the night side stand at 157 to 190 of luma, about three quarters of the band's (7w's design review).
const LINE_LIGHT = [150, 195] as const;
// The band's width at half its light on the night side, a share of the radius: frame 103's is 0.24 (79 to 86 px on 342).
const BAND_SPAN = [0.18, 0.3] as const;
// A grid line over the ground it covers: frame 104's add 50 to 130 of luma, on the day and the night side alike.
const LINE = 40;
// Frame 104's lines are about 1.5 px wide.
const THIN = 3;
// The night side, on a picture without the grid.
const NIGHT = 30;
// A line read on one picture: a ridge standing this much over the ground either side of it. Measured on this spec's first build, rows of
// Bubble 0.5 up, 0.55 down and 0.3 up: the grid's lines stand 2 or 3 there, the ground alone none at 60 (one or two at 25, its clouds).
const RIDGE = 60;

test.describe.configure({ timeout: 400_000 });
test.use({ viewport: COMPUTER });

interface Shown {
  frames: number;
  state: string;
  centre: { x: number; y: number; radius: number };
  appearance: { band: number; grid: number };
}
// The world as the scene says it, with the frames it has drawn, or none before the scene runs.
const world = (page: Page) =>
  page.evaluate(() => {
    const scene: unknown = Reflect.get(globalThis, "__gnoworldScene");
    const said = (scene as { stats: () => { world: unknown; frames: number } } | undefined)?.stats();
    return said?.world === undefined ? undefined : ({ ...(said.world as object), frames: said.frames } as Shown);
  });
const visits = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("gnoworld:visited:")));

// The page's clock moved `step` ms at a time, a frame at 16, until `wanted` holds of the world drawn, as cosmos.spec.ts steps the dive.
async function stepUntil(
  page: Page,
  wanted: (shown: Shown) => boolean,
  { what, step = FRAME_MS }: { what: string; step?: number },
) {
  let found: Shown | undefined;
  await expect
    .poll(
      async () => {
        await page.clock.runFor(step);
        const shown = await world(page);
        if (shown?.state === "drawn" && wanted(shown)) found = shown;
        return found !== undefined;
      },
      { ...SLOW, intervals: [10], message: what },
    )
    .toBe(true);
  if (found === undefined) throw new Error("no world");
  return found;
}

// A world's page reached by `go`, the page's clock installed, then held once it runs: back once its world is drawn, its loading stepped
// three frames at a time.
async function arrived(page: Page, go: () => Promise<unknown>) {
  await go();
  await hydrated(page);
  await held(page);
  return stepUntil(page, () => true, { what: "the world drawn", step: 3 * FRAME_MS });
}

// A world's page opened with the clock held, once its world is drawn.
async function opened(page: Page, path = "/w/govdao?test-gpu") {
  await page.clock.install();
  return arrived(page, () => page.goto(path));
}

// Every band and grid the world shows, a frame at a time, with the frame that drew it, until its grid has come and gone, or for `frames`
// frames if none comes.
async function watched(page: Page, frames: number) {
  const seen: (Shown["appearance"] & { frame: number })[] = [];
  for (let step = 0; step < frames || seen.some(({ grid }) => grid > 0); step += 1) {
    await page.clock.runFor(FRAME_MS);
    const now = await world(page);
    if (now !== undefined) seen.push({ ...now.appearance, frame: now.frames });
    if (seen.some(({ grid }) => grid > 0) && now?.appearance.grid === 0) break;
    if (step > 20 * frames) throw new Error("the grid never went");
  }
  return seen;
}

// The next visit to Bubble, `go` there with the page's clock held: its appearance plays whole, and the device keeps the visit.
async function playsNext(page: Page, go: () => Promise<unknown>) {
  await arrived(page, go);
  const seen = await watched(page, 60);
  expect(Math.max(...seen.map(({ grid }) => grid)), "the appearance plays").toBe(1);
  expect(await visits(page)).toHaveLength(1);
}

// Along a line of two pictures, from `from` to `to` (a row at `at`, or a column), each run of pixels where the first is brighter than the
// second by `least` of luma: where it starts, its width, and whether the second picture is night there.
const brighterRuns = ({
  at,
  from,
  to,
  least,
  night,
  column = false,
}: {
  at: number;
  from: number;
  to: number;
  least: number;
  night: number;
  column?: boolean;
}) => {
  const { images, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  const [shown, bare] = images;
  if (shown === undefined || bare === undefined) throw new Error("two pictures are read");
  const point = (along: number): [number, number] => (column ? [at, along] : [along, at]);
  const runs: { start: number; width: number; dark: boolean }[] = [];
  let start = -1;
  for (let along = from; along <= to + 1; along += 1) {
    const lit = along <= to && luma(shown, ...point(along)) - luma(bare, ...point(along)) >= least;
    if (lit && start < 0) start = along;
    if (!lit && start >= 0) {
      const middle = Math.round((start + along - 1) / 2);
      runs.push({ start, width: along - start, dark: luma(bare, ...point(middle)) < night });
      start = -1;
    }
  }
  return runs;
};

// The brightest luma of the first of two pictures over each run, and of the second at the same pixel.
const runPeaks = ({ at, runs }: { at: number; runs: { start: number; width: number }[] }) => {
  const { images, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  return images.map((image) =>
    runs.map(({ start, width }) => {
      let most = 0;
      for (let x = start; x < start + width; x += 1) most = Math.max(most, luma(image, x, at));
      return most;
    }),
  );
};

// The band's width at half its light, on the night side's columns, south of its peak where no line is drawn, as a share of the radius: the
// median of the columns read, and how many.
const bandSpan = ({ x, y, radius, night }: { x: number; y: number; radius: number; night: number }) => {
  const { images, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  const [lit, bare] = images;
  if (lit === undefined || bare === undefined) throw new Error("two pictures are read");
  const spans: number[] = [];
  for (let column = Math.ceil(x - 0.8 * radius); column <= x; column += 4) {
    if (luma(bare, column, Math.round(y)) >= night) continue;
    let peak = Math.round(y - 0.4 * radius);
    for (let row = peak; row <= y + 0.6 * radius; row += 1)
      if (luma(lit, column, row) > luma(lit, column, peak)) peak = row;
    const half = (luma(lit, column, peak) + luma(bare, column, peak)) / 2;
    let below = 0;
    while (luma(lit, column, peak + below + 1) >= half) below += 1;
    spans.push((2 * below + 1) / radius);
  }
  spans.sort((one, two) => one - two);
  return { columns: spans.length, median: spans[Math.floor(spans.length / 2)] ?? 0 };
};

test("plays on this reader's first visit to a world, its band running down, and a reload, which the device remembers, plays none", async ({
  page,
}) => {
  await opened(page);
  const first = await watched(page, 60);
  expect(Math.max(...first.map(({ grid }) => grid)), "the grid came whole").toBe(1);
  const bands = first.map(({ band }) => band);
  const onTheWorld = bands.filter((band) => Math.abs(band) < 1);
  expect(onTheWorld.length, "the band ran over the world, a frame at a time").toBeGreaterThan(10);
  // Each frame drawn while the band crosses the world moves it down: a band that stalls, or runs up, fails (7w's review, F4534).
  const crossing = first.filter(
    ({ grid, band }, at) => grid > 0 && Math.abs(band) < BAND_REACH && first[at - 1]?.frame !== first[at]?.frame,
  );
  for (let at = 1; at < crossing.length; at += 1)
    expect(crossing[at]?.band, `the band runs down: ${JSON.stringify(crossing)}`).toBeLessThan(
      crossing[at - 1]?.band ?? Infinity,
    );
  expect(Math.abs(bands.at(-1) ?? 0), "and leaves the world").toBeGreaterThanOrEqual(OFF);
  expect(await visits(page)).toHaveLength(1);
  await arrived(page, () => page.reload());
  const again = await watched(page, 200);
  expect(Math.max(...again.map(({ grid }) => grid)), "no grid on a return").toBe(0);
  expect(Math.min(...again.map(({ band }) => Math.abs(band))), "no band on the world").toBeGreaterThanOrEqual(OFF);
});

// The visit is kept as the grid starts (Alexis, 2026-11-04, F4533): a tab closed while the maps load, or a world whose maps fail, keeps none,
// so the next visit plays the appearance. The worker would answer the maps past `page.route`: with it off, the fault is the one planted.
test.describe("a world that does not come", () => {
  test.use({ serviceWorkers: "block" });
  const MAPS = "**/textures/*.webp";
  const stateOf = async (page: Page) => {
    await page.clock.runFor(3 * FRAME_MS);
    return (await world(page))?.state;
  };

  test("keeps no visit while its maps never come, nor once they fail, and the next visit plays the appearance", async ({
    page,
  }) => {
    await page.route(MAPS, () => undefined);
    await page.clock.install();
    await page.goto("/w/bubble?test-gpu");
    await hydrated(page);
    await held(page);
    await expect.poll(() => stateOf(page), { ...SLOW, intervals: [10] }).toBe("loading");
    await page.clock.runFor(1_000);
    expect(await visits(page), "the maps still coming").toEqual([]);
    await page.unroute(MAPS);
    await page.route(MAPS, (route) => route.fulfill({ status: 404, body: "" }));
    await page.reload();
    await hydrated(page);
    await held(page);
    await expect.poll(() => stateOf(page), { ...SLOW, intervals: [10] }).toBe("failed");
    expect(await visits(page), "the world failed").toEqual([]);
    await page.unroute(MAPS);
    await playsNext(page, () => page.reload());
  });
});

// A flight backed out of keeps no visit (F4533): a page's flight holds in transit till its world is drawn and lands after it, so with the
// page's clock held the reader goes back between the two. Read at the flights' small size, which the gate's software GPU draws in time.
test.describe("a flight backed out of", () => {
  test.use({ viewport: { width: 1000, height: 700 } });

  test("keeps no visit when the reader goes back before the world lands, and the next visit plays the appearance", async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto("/?test-gpu");
    await hydrated(page);
    await running(page);
    await landed(page);
    await held(page);
    await page.locator("a[href='/w/bubble']").first().click();
    let along = NaN;
    await expect
      .poll(
        async () => {
          await page.clock.runFor(FRAME_MS);
          const { flight } = await stats(page);
          along = flight?.along ?? NaN;
          return flight?.kind === "body" && (await world(page))?.state === "drawn";
        },
        { ...SLOW, intervals: [10] },
      )
      .toBe(true);
    expect(along, "the world drawn while the flight still brings it").toBeLessThan(1);
    await page.goBack();
    await expect(page).toHaveURL(/\/\?test-gpu$/);
    await page.clock.runFor(500);
    expect(await visits(page), "the flight backed out of").toEqual([]);
    await playsNext(page, () => page.goto("/w/bubble?test-gpu"));
  });
});

test("under reduced motion: a still grid shown whole and faded, with no band", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await opened(page);
  const seen = await watched(page, 60);
  expect(Math.max(...seen.map(({ grid }) => grid))).toBe(1);
  expect(seen.at(-1)?.grid).toBe(0);
  expect(Math.max(...seen.map(({ band }) => band))).toBeLessThanOrEqual(-OFF);
});

// Frame 104 (measured): lines about 1.5 px wide, as bright on the night side as on the day, a meridian every 36 degrees, so 3 to 5 cross the
// equator's row within 0.95 of the radius, and parallels at 18 and 54 degrees either side of the equator, none on it. Read under reduced
// motion, where nothing turns: the grid whole against the world without it, the same frame of the world.
test("draws thin lines as frame 104's, meridians every 36 degrees on the night side and the day, parallels off the equator", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await opened(page);
  const shown = await stepUntil(page, ({ appearance }) => appearance.grid === 1, { what: "the grid whole" });
  const whole = await page.screenshot();
  const fading = await stepUntil(page, ({ appearance }) => appearance.grid <= 0.5, { what: "the grid half faded" });
  const half = await page.screenshot();
  await stepUntil(page, ({ appearance }) => appearance.grid === 0, { what: "the grid gone" });
  const bare = await page.screenshot();
  const { x, y, radius } = shown.centre;
  const meridians = await reading(
    page,
    [whole, bare],
    [
      brighterRuns,
      {
        at: Math.round(y),
        from: Math.ceil(x - 0.95 * radius),
        to: Math.floor(x + 0.95 * radius),
        least: LINE,
        night: NIGHT,
      },
    ],
  );
  const said = JSON.stringify(meridians);
  expect(meridians.length, `the meridians crossing the equator's row: ${said}`).toBeGreaterThanOrEqual(3);
  expect(meridians.length, said).toBeLessThanOrEqual(5);
  expect(Math.max(...meridians.map(({ width }) => width)), `thin, as frame 104's: ${said}`).toBeLessThanOrEqual(THIN);
  expect(meridians.filter(({ dark }) => dark).length, `on the night side: ${said}`).toBeGreaterThanOrEqual(1);
  expect(meridians.filter(({ dark }) => !dark).length, `on the day side: ${said}`).toBeGreaterThanOrEqual(1);
  // On the night side a line stands as frames 103's and 104's do, under the band's light, and fades as the grid says (7w's reviews).
  const [inWhole = [], inHalf = [], inBare = []] = await reading(
    page,
    [whole, half, bare],
    [runPeaks, { at: Math.round(y), runs: meridians.filter(({ dark }) => dark) }],
  );
  for (const [at, peak] of inWhole.entries()) {
    const ground = inBare[at] ?? 0;
    expect(peak, `a line's light on the night side: ${JSON.stringify(inWhole)}`).toBeGreaterThanOrEqual(LINE_LIGHT[0]);
    expect(peak, `a line's light on the night side: ${JSON.stringify(inWhole)}`).toBeLessThanOrEqual(LINE_LIGHT[1]);
    const share = ((inHalf[at] ?? 0) - ground) / (peak - ground);
    const grid = fading.appearance.grid;
    expect(Math.abs(share - grid), `it fades as the grid: ${String(share)} of it at ${String(grid)}`).toBeLessThan(
      0.15,
    );
  }
  // A column halfway between the two meridians nearest the middle, clear of them: it meets the parallels alone.
  const middle = [...meridians].sort((one, two) => Math.abs(one.start - x) - Math.abs(two.start - x)).slice(0, 2);
  const between = Math.round(middle.reduce((sum, { start }) => sum + start, 0) / middle.length);
  const parallels = await reading(
    page,
    [whole, bare],
    [
      brighterRuns,
      {
        at: between,
        from: Math.ceil(y - 0.75 * radius),
        to: Math.floor(y + 0.75 * radius),
        least: LINE,
        night: NIGHT,
        column: true,
      },
    ],
  );
  const read = JSON.stringify(parallels);
  expect(parallels.length, `the parallels at 18 degrees either side: ${read}`).toBeGreaterThanOrEqual(2);
  expect(
    parallels.filter(({ start }) => Math.abs(start - y) < 0.15 * radius),
    `none on the equator: ${read}`,
  ).toEqual([]);
});

// Along the row `at` of each picture, from `from` to `to`: the thin bright ridges, a run of `thin` px at most standing `least` of luma over the
// pixels `side` px either side. A turn of the world moves its ground's own ridges, never adds any: each picture is read alone.
const ridges = ({
  at,
  from,
  to,
  least,
  thin,
  side,
}: {
  at: number;
  from: number;
  to: number;
  least: number;
  thin: number;
  side: number;
}) => {
  const { images, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  return images.map((image) => {
    let found = 0;
    let run = 0;
    for (let x = from; x <= to + 1; x += 1) {
      const here = x <= to ? luma(image, x, at) : 0;
      const ridge = x <= to && here - Math.max(luma(image, x - side, at), luma(image, x + side, at)) >= least;
      if (ridge) run += 1;
      else {
        if (run > 0 && run <= thin) found += 1;
        run = 0;
      }
    }
    return found;
  });
};

// The steps beside frames 20, 103, 104 and 105, written for the design review: the band under the north cap, then just under the equator
// with the grid north of it and none south, the grid whole and fading, then nothing.
test("shows each step as frames 103, 104 and 105 do: the grid drawn north of the band, none south of it", async ({
  page,
}, info) => {
  await opened(page);
  // Each step's picture written beside the test's output, and attached, for the design review.
  const shot = async (name: string) => {
    const path = info.outputPath(`appearance-${name}.png`);
    const picture = await page.screenshot({ path });
    await info.attach(`appearance-${name}.png`, { path, contentType: "image/png" });
    return picture;
  };
  await stepUntil(page, ({ appearance }) => appearance.band <= FRAME_20_BAND && appearance.grid > 0, {
    what: "the band at the cap",
  });
  const at20 = await shot("20");
  const banded = await stepUntil(page, ({ appearance }) => appearance.band <= FRAME_103_BAND && appearance.grid > 0, {
    what: "the band at 103's",
  });
  const at103 = await shot("103");
  await stepUntil(page, ({ appearance }) => appearance.band <= -OFF && appearance.grid <= FRAME_104_GRID, {
    what: "the grid at 104's",
  });
  await shot("104");
  await stepUntil(page, ({ appearance }) => appearance.grid === 0, { what: "the grid gone" });
  const at105 = await shot("105");
  const { x, y, radius } = banded.centre;
  const across = {
    from: Math.ceil(x - 0.8 * radius),
    to: Math.floor(x + 0.8 * radius),
    least: RIDGE,
    thin: THIN,
    side: 3,
  };
  const [north103 = 0, north105 = 0] = await reading(
    page,
    [at103, at105],
    [ridges, { ...across, at: Math.round(y - 0.5 * radius) }],
  );
  const [south103 = 0, south105 = 0] = await reading(
    page,
    [at103, at105],
    [ridges, { ...across, at: Math.round(y + 0.55 * radius) }],
  );
  expect(
    north103 - north105,
    `lines north of the band: ${String(north103)} at 103, ${String(north105)} at 105`,
  ).toBeGreaterThanOrEqual(2);
  expect(south103, `none south of it: ${String(south103)} at 103, ${String(south105)} at 105`).toBeLessThanOrEqual(
    south105,
  );
  // Earlier, the band at the north cap (frame 20's GovDAO): nothing drawn yet a third of the way up.
  const [up20 = 0, up105 = 0] = await reading(
    page,
    [at20, at105],
    [ridges, { ...across, at: Math.round(y - 0.3 * radius) }],
  );
  expect(up20, `none under the cap: ${String(up20)} at the cap, ${String(up105)} at 105`).toBeLessThanOrEqual(up105);
  // The band as wide as frame 103's, at half its light (7w's design review).
  const span = await reading(page, [at103, at105], [bandSpan, { x, y, radius, night: NIGHT }]);
  expect(span.columns, "the night side's columns read").toBeGreaterThanOrEqual(3);
  expect(span.median, `the band's width: ${JSON.stringify(span)}`).toBeGreaterThanOrEqual(BAND_SPAN[0]);
  expect(span.median, `the band's width: ${JSON.stringify(span)}`).toBeLessThanOrEqual(BAND_SPAN[1]);
});

// Each run's width at half its peak, in the picture's pixels: what the first of two pictures adds over the second along the row `at`.
const halfWidths = ({ at, runs }: { at: number; runs: { start: number; width: number }[] }) => {
  const { images, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  const [shown, bare] = images;
  if (shown === undefined || bare === undefined) throw new Error("two pictures are read");
  const added = (x: number) => luma(shown, x, at) - luma(bare, x, at);
  return runs.map(({ start, width }) => {
    let peak = 0;
    for (let x = start; x < start + width; x += 1) peak = Math.max(peak, added(x));
    let wide = 0;
    for (let x = start - 2; x < start + width + 2; x += 1) if (added(x) >= peak / 2) wide += 1;
    return wide;
  });
};

// At a pixel ratio of 2, which a computer's high tier draws at, a line keeps frame 104's width in the page's pixels: about 3 of the picture's
// at half its light, never the 1.5 a buffer's pixel would make it (7w's review). Read at 1,280 by 800, under reduced motion, as above.
test.describe("at a pixel ratio of 2", () => {
  test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

  test("draws the grid's lines as wide in the page as at a ratio of 1", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await opened(page);
    const shown = await stepUntil(page, ({ appearance }) => appearance.grid === 1, { what: "the grid whole" });
    const ratio = await page.evaluate(
      () => (Reflect.get(globalThis, "__gnoworldScene") as { stats: () => { ratio: number } }).stats().ratio,
    );
    expect(ratio, "the scene draws at the screen's ratio").toBe(2);
    const whole = await page.screenshot();
    await stepUntil(page, ({ appearance }) => appearance.grid === 0, { what: "the grid gone" });
    const bare = await page.screenshot();
    const { x, y, radius } = shown.centre;
    const row = {
      at: Math.round(2 * y),
      from: Math.ceil(2 * (x - 0.9 * radius)),
      to: Math.floor(2 * (x + 0.9 * radius)),
      least: LINE,
      night: NIGHT,
    };
    const runs = await reading(page, [whole, bare], [brighterRuns, row]);
    const widths = (await reading(page, [whole, bare], [halfWidths, { at: row.at, runs }])).sort(
      (one, two) => one - two,
    );
    expect(widths.length, JSON.stringify(runs)).toBeGreaterThanOrEqual(3);
    const said = `the lines' widths at half their light, in the picture's pixels: ${JSON.stringify(widths)}`;
    expect(widths[Math.floor(widths.length / 2)], said).toBeGreaterThanOrEqual(3);
    expect(Math.max(...widths), said).toBeLessThanOrEqual(2 * THIN);
  });
});
