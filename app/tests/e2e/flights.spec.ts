import { readFileSync } from "node:fs";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { box, near } from "./geometry.ts";
import { landed, running, stats, type FlightStats } from "./sceneStage.ts";

// Flights (7g; ADR-0001 §7; ADR-0002 §1, "Flight panel"; frames 18, 19, 36, 88, 89, 101, 128, 129, 142): the jump to a star the reader aims
// at, Escape landing at once, the way back, a page's flight, a crossfade under reduced motion, and what twenty flights leave behind (row 7's
// test, slice 7 §1). Every journey runs under the page's CSP, and fails on a violation (fixtures.ts).
const HOME = "/?test-gpu";
const FRAME = { width: 1728, height: 1080 };
const PHONE = { width: 390, height: 844 };
// Small enough for twenty flights on the gate's software GPU, wide enough for a computer's layout.
const SMALL = { width: 1000, height: 700 };
// The panel's regions on frames 18, 36, 88, 89, 101 and 142, at device scale 1: its box, its target's left, its bar.
const PANEL = { x: 586, y: 103, width: 558, height: 120 };
const TARGET_LEFT = 610;
const BAR = { x: 610, y: 205, width: 511 };
const SLOW = { timeout: 90_000 };
const PHASES = ["Course plotted · leaving orbit", "In transit", "Entering orbit"];
const RECORDED = readFileSync(new URL("../../lab/worlds.json", import.meta.url), "utf8");

test.describe.configure({ timeout: 240_000 });

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
// What the page showed of the panel, read in the page as it changed: its first boxes, each phase in turn, and when it went.
interface PanelSeen {
  panel: Box | undefined;
  target: Box | undefined;
  bar: Box | undefined;
  named: string;
  phases: string[];
  shownAt: number;
  goneAt: number;
  drawnAt: number;
  // The narrowest room between a value's words and the next column, and the figures ever cut short, through the whole flight.
  tightest: number;
  cut: string[];
  widest: string;
  // The page's plate as each phase of the panel came in: frames 19, 36 and 101 fly with no plate.
  plates: string[];
}

const flightOf = async (page: Page): Promise<FlightStats | undefined> => (await stats(page)).flight;

async function home(page: Page, size = FRAME, motion: "reduce" | "no-preference" = "no-preference") {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto(HOME);
  await hydrated(page);
  await running(page);
  await landed(page);
  await expect.poll(async () => (await flightOf(page)) !== undefined, SLOW).toBe(true);
}

// Watches the panel from now on, in the page: a journey's own reads come too late for a flight of a second or two.
const watchPanel = (page: Page) =>
  page.evaluate(() => {
    const seen: PanelSeen = {
      named: "",
      panel: undefined,
      target: undefined,
      bar: undefined,
      phases: [],
      shownAt: NaN,
      goneAt: NaN,
      drawnAt: NaN,
      tightest: Infinity,
      cut: [],
      widest: "",
      plates: [],
    };
    Reflect.set(globalThis, "__panelSeen", seen);
    const boxOf = (element: Element | null) => {
      if (element === null) return undefined;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const first = (panel: Element) => {
      seen.shownAt = performance.now();
      seen.panel = boxOf(panel);
      seen.target = boxOf(panel.querySelector("dd"));
      seen.bar = boxOf(panel.querySelector("[data-along]"));
      seen.named = panel.querySelector("dd")?.textContent ?? "";
    };
    // A value's words end where they end, or where its column cuts them; the target alone may be cut (frame 89).
    const wordsEnd = (value: Element) => {
      const words = document.createRange();
      words.selectNodeContents(value);
      return Math.min(words.getBoundingClientRect().right, value.getBoundingClientRect().right);
    };
    const room = (panel: Element) => {
      const values = [...panel.querySelectorAll("dd")];
      values.slice(1).forEach((value, index) => {
        const before = values[index];
        if (before !== undefined)
          seen.tightest = Math.min(seen.tightest, value.getBoundingClientRect().left - wordsEnd(before));
        if (value.scrollWidth > value.clientWidth) seen.cut.push(value.textContent);
        if (value.textContent.length > seen.widest.length) seen.widest = value.textContent;
      });
    };
    const gone = () => {
      if (!Number.isNaN(seen.shownAt) && Number.isNaN(seen.goneAt)) seen.goneAt = performance.now();
    };
    new MutationObserver(() => {
      const panel = document.querySelector("[data-flight]");
      if (document.querySelector("[data-globe][data-world='drawn']") !== null && Number.isNaN(seen.drawnAt))
        seen.drawnAt = performance.now();
      if (panel === null) {
        gone();
        return;
      }
      if (Number.isNaN(seen.shownAt)) first(panel);
      room(panel);
      const phase = panel.querySelector("[data-phase]")?.textContent ?? "";
      if (seen.phases.at(-1) !== phase) {
        seen.phases.push(phase);
        const plate = document.querySelector("[data-look='plate']");
        seen.plates.push(plate === null ? "none" : getComputedStyle(plate).visibility);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
  });
const panelSeen = (page: Page) => page.evaluate(() => Reflect.get(globalThis, "__panelSeen") as PanelSeen);

// The great star on screen, which the view at rest always holds: the star a reader aims at here.
async function aimAtTheGreatStar(page: Page) {
  const sun = (await stats(page)).cosmos?.screen.sun;
  if (sun === undefined) throw new Error("no great star on screen");
  await page.mouse.click(sun.x, sun.y);
}

const fly = (page: Page, goal: unknown) =>
  page.evaluate((to) => {
    (Reflect.get(globalThis, "__gnoworldScene") as { fly: (goal: unknown) => void }).fly(to);
  }, goal);

const flown = (page: Page) => expect.poll(async () => (await flightOf(page))?.flying, SLOW).toBe(false);

const labelsShown = (page: Page) =>
  page.$$eval(
    "[data-labels] > *",
    (labels) => labels.filter((label) => Number(getComputedStyle(label).opacity) > 0.05).length,
  );

const nearBox = (seen: Box | undefined, frame: Partial<Box>, what: string) => {
  expect(seen, `${what} was never seen`).toBeDefined();
  for (const key of ["x", "y", "width", "height"] as const) {
    const want = frame[key];
    if (want !== undefined) near(seen?.[key] ?? NaN, want, `${what}'s ${key}`);
  }
};

test("stands the flight panel where the frames stand it, under the header in the middle, its regions in place", async ({
  page,
}) => {
  await home(page);
  await watchPanel(page);
  await aimAtTheGreatStar(page);
  await expect.poll(async () => (await flightOf(page))?.flights, SLOW).toBe(1);
  await flown(page);
  await expect(page.locator("[data-flight]")).toHaveCount(0);
  const seen = await panelSeen(page);
  expect(seen.named).toBe("gno.land");
  nearBox(seen.panel, PANEL, "the panel");
  near(seen.target?.x ?? NaN, TARGET_LEFT, "the target's left");
  nearBox(seen.bar, BAR, "the bar");
  expect(seen.phases).toEqual(PHASES);
});

// Frame 18's figures stand apart at four digits, "1,158 km/s" and its time: never run together, never cut. A far star of the recorded worlds
// file (samcrew's, past 2,000 km/s on its way), as the great star's way is too short for four digits.
test("keeps the panel's figures apart and whole at four digits", async ({ page }) => {
  await page.route("**/worlds.json", (route) => route.fulfill({ body: RECORDED, contentType: "application/json" }));
  await home(page);
  await watchPanel(page);
  await fly(page, { kind: "star", id: "samcrew" });
  await expect.poll(async () => (await flightOf(page))?.flights, SLOW).toBe(1);
  await flown(page);
  const seen = await panelSeen(page);
  expect(seen.widest).toMatch(/^\d,\d{3} km\/s$/);
  expect(seen.cut).toEqual([]);
  expect(seen.tightest, `the widest figure seen: ${seen.widest}`).toBeGreaterThanOrEqual(8);
});

test("keeps the panel in a phone's gutters, under its header", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(HOME);
  await hydrated(page);
  await page.getByRole("button", { name: "View in space" }).click();
  await running(page);
  await landed(page);
  await expect.poll(async () => (await flightOf(page)) !== undefined, SLOW).toBe(true);
  await watchPanel(page);
  const header = await box(page, "header");
  await fly(page, { kind: "star", id: "gno.land" });
  await flown(page);
  const { panel } = await panelSeen(page);
  if (panel === undefined) throw new Error("the panel was never seen");
  expect(panel.x).toBeGreaterThanOrEqual(16);
  expect(panel.x + panel.width).toBeLessThanOrEqual(PHONE.width - 16);
  expect(panel.y).toBeGreaterThanOrEqual(header.y + header.height);
});

test("jumps to the star aimed at, lands at once on Escape, and comes back on Escape", async ({ page }) => {
  await home(page);
  // The labels stand once the cosmos has looked: by then its stars can be aimed at.
  await expect.poll(() => labelsShown(page), SLOW).toBeGreaterThan(0);
  await aimAtTheGreatStar(page);
  await expect.poll(async () => (await flightOf(page))?.flying).toBe(true);
  expect(await flightOf(page)).toMatchObject({ kind: "star", target: "gno.land" });
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await flightOf(page))?.flying, { timeout: 2_000 }).toBe(false);
  expect((await flightOf(page))?.along).toBe(1);
  const there = (await flightOf(page))?.travel ?? { x: 0, y: 0, z: 0 };
  expect(Math.hypot(there.x, there.y, there.z)).toBeGreaterThan(1);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await flightOf(page))?.kind).toBe("rest");
  await flown(page);
  expect((await flightOf(page))?.travel).toEqual({ x: 0, y: 0, z: 0 });
});

// Frame 18 keeps its labels beside the panel: a flight leaves them as they are, only the home's dive hides them (the chief, 2026-11-03,
// after the design review). Read in the page on every frame of the flight past 0.3 of the way, when a label told to go would have faded
// long since; mid-way to samcrew no labelled body may be in view, so some frame, not each, holds one.
test("keeps the labels through a flight, as frame 18 does", async ({ page }) => {
  await page.route("**/worlds.json", (route) => route.fulfill({ body: RECORDED, contentType: "application/json" }));
  await home(page);
  await expect.poll(() => labelsShown(page), SLOW).toBeGreaterThan(0);
  const shown = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const scene = Reflect.get(globalThis, "__gnoworldScene") as {
          stats: () => { flight?: { flying: boolean; along: number } };
        };
        const counts: number[] = [];
        let flew = false;
        const frame = () => {
          const flight = scene.stats().flight;
          flew ||= flight?.flying === true;
          if (flight?.flying === true && flight.along > 0.3)
            counts.push(
              [...document.querySelectorAll("[data-labels] > *")].filter(
                (label) => Number(getComputedStyle(label).opacity) > 0.05,
              ).length,
            );
          if (flew && flight?.flying === false) resolve(counts);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  await fly(page, { kind: "star", id: "samcrew" });
  const counts = await shown;
  expect(counts.length).toBeGreaterThan(0);
  expect(Math.max(...counts), `labels on each frame past 0.3 of the way: ${counts.join(", ")}`).toBeGreaterThan(0);
});

test("draws its streaks while it crosses, and none at rest", async ({ page }) => {
  await home(page);
  expect((await flightOf(page))?.streaks).toBe(0);
  await aimAtTheGreatStar(page);
  await expect.poll(async () => (await flightOf(page))?.streaks ?? 0, SLOW).toBeGreaterThan(0);
  await flown(page);
  expect((await flightOf(page))?.streaks).toBe(0);
});

test("crossfades under reduced motion: no camera moves between, no panel, the copy gone in a moment", async ({
  page,
}) => {
  await home(page, FRAME, "reduce");
  await watchPanel(page);
  const before = (await flightOf(page))?.flights ?? NaN;
  await aimAtTheGreatStar(page);
  await expect.poll(async () => (await flightOf(page))?.flights).toBe(before + 1);
  await expect.poll(async () => (await flightOf(page))?.along).toBe(1);
  await expect.poll(async () => (await flightOf(page))?.veil, { timeout: 5_000 }).toBe(0);
  expect((await panelSeen(page)).phases).toEqual([]);
});

test("flies from the cosmos to a world's page: the panel names it, and lands as the world comes into its circle", async ({
  page,
}) => {
  await home(page, SMALL);
  await watchPanel(page);
  await page.locator("a[href='/w/bubble']").first().click();
  await expect.poll(async () => (await flightOf(page))?.kind, SLOW).toBe("body");
  await flown(page);
  await expect(page.locator("[data-globe]")).toHaveAttribute("data-world", "drawn", SLOW);
  const seen = await panelSeen(page);
  expect(seen.phases).toEqual(PHASES);
  expect(seen.named).toBe("Bubble");
  // It waits in transit for the world, and is let go by the world drawn, never by the two seconds' end, on its own clock: the gate's
  // software GPU draws slow frames, which no wall clock tells from a wait.
  const { waited } = (await flightOf(page)) ?? { waited: NaN };
  expect(waited).toBeLessThan(2);
  expect(seen.goneAt).toBeGreaterThanOrEqual(seen.drawnAt);
  // The plate waits out of sight while the world comes, and is there once it has landed (F3707).
  expect(seen.plates).toEqual(["hidden", "hidden", "hidden"]);
  await expect(page.locator("[data-look='plate']")).toBeVisible();
});

// Row 7's test, word for word: "After 20 flights, GPU resources are at their baseline and the JS heap is within 10%" (Playwright's CDP
// session, slice 7 §9, question 17). Every kind of flight, half of them pages' flights, which copy a frame each, driven through the scene: a
// world page's own warming (its code compiled, its style sheets) is no flight's (heap snapshots, 2026-11-03). The baseline after one round.
test("leaves the GPU's resources at their baseline and the heap within a tenth after twenty flights there and back", async ({
  page,
}) => {
  test.setTimeout(600_000);
  await home(page, SMALL);
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    return (await cdp.send("Runtime.getHeapUsage")).usedSize;
  };
  const gpu = async () => {
    const { geometries, textures } = await stats(page);
    return { geometries, textures };
  };
  // Once the looks a flight asks for are done: two reads half a second apart agree.
  const steady = () =>
    expect
      .poll(async () => {
        const first = await gpu();
        await page.waitForTimeout(500);
        return JSON.stringify(first) === JSON.stringify(await gpu());
      }, SLOW)
      .toBe(true);
  const round = async () => {
    for (const goal of [
      { kind: "star", id: "gno.land" },
      { kind: "rest" },
      { kind: "body", name: "Bubble" },
      { kind: "cosmos", name: "Cosmos" },
    ]) {
      await fly(page, goal);
      await flown(page);
    }
  };
  await test.step("one round of each kind first", round);
  await steady();
  const before = { ...(await gpu()), heap: await heap(), flights: (await flightOf(page))?.flights ?? NaN };
  for (let flight = 0; flight < 20; flight += 4)
    await test.step(`flights ${String(flight + 1)} to ${String(flight + 4)}`, round);
  await steady();
  expect((await flightOf(page))?.flights).toBe(before.flights + 20);
  expect(await gpu()).toEqual({ geometries: before.geometries, textures: before.textures });
  expect(await heap()).toBeLessThanOrEqual(before.heap * 1.1);
});
