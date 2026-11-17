import { readFileSync } from "node:fs";
import { COUNTED, expect, hydrated, test, type Page } from "./fixtures.ts";
import { box } from "./geometry.ts";
import { countShifts, running, shifted, worldsDrawn } from "./sceneStage.ts";

// The hero's number: the worlds the cosmos draws, read from the count the job writes beside the worlds' file, so a home whose scene
// does not run keeps it (no WebGL; this browser's software GPU without `?test-gpu`) and a phone asks nothing of the cosmos at all.
// The host serves neither file (the job writes them): each test serves Onyx's recorded file and its count.
const RECORDED = readFileSync(new URL("../recordedWorlds.json", import.meta.url), "utf8");
const NUMBER = "[data-hero='number']";
// The recorded file's 533 worlds, each once in its namespace, and the Earth: written out, so a counting fault cannot move it with the page
// nor with the count the fixtures serve.
const COUNT = "534";

// Serves the recorded file and its count, and counts the requests for each; a held count answers only once `release` is called.
async function served(page: Page, { held = false } = {}) {
  const asked = { worlds: 0, count: 0 };
  let release: () => void = () => undefined;
  const released = new Promise<void>((done) => {
    release = done;
  });
  if (!held) release();
  await page.route("**/worlds.json", async (route) => {
    asked.worlds += 1;
    await route.fulfill({ body: RECORDED, contentType: "application/json" });
  });
  await page.route("**/worlds-count.json", async (route) => {
    asked.count += 1;
    await released;
    await route.fulfill({ body: COUNTED, contentType: "application/json" });
  });
  return { worlds: () => asked.worlds, count: () => asked.count, release };
}

// A computer's width alone: a phone has no home page, it opens straight into a chat (D13720).
for (const width of [1280]) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("the home without the scene keeps its number, from the worlds' count, and a phone asks nothing of the worlds' file", async ({
      page,
    }) => {
      const file = await served(page);
      await page.goto("/");
      await hydrated(page);
      await expect(page.locator(NUMBER)).toHaveText(COUNT);
      await expect(page.locator("h1")).toHaveText(`${COUNT} worlds in Onyx`);
      expect(await page.evaluate(() => Reflect.has(globalThis, "__gnoworldSpace")), "no scene ran").toBe(false);
      await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
      expect(file.count()).toBe(1);
      // The page preloads the worlds' file (preloads.ts, in the HTML), once, whether the scene runs or not.
      expect(file.worlds()).toBe(1);
    });

    // The hero as the frames draw it (2 to 8), with a count: from its kicker to its actions, the live line and the ticker left out.
    test("the hero as it looks with its number", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      // A first visit's welcome card is not the hero: it is told away.
      await page.addInitScript(() => {
        localStorage.setItem("gnoworld:welcomed", "1");
      });
      await served(page);
      await page.goto("/");
      await hydrated(page);
      await expect(page.locator(NUMBER)).toHaveText(COUNT);
      const kicker = await box(page, "[data-clear] > p");
      const actions = await box(page, "[data-hero='actions']");
      const top = Math.floor(kicker.y) - 8;
      // The hero's own column: the rail's panel, which rises at its own time at the right, is not in the picture.
      await expect(page).toHaveScreenshot(`hero-${String(width)}.png`, {
        clip: { x: 0, y: top, width: Math.min(width, 800), height: Math.ceil(actions.y + actions.height) + 8 - top },
      });
    });

    test("the hero keeps its number's room while the count comes: nothing on the page moves", async ({ page }) => {
      await countShifts(page);
      const file = await served(page, { held: true });
      await page.goto("/");
      await hydrated(page);
      await expect.poll(() => file.count()).toBe(1);
      const number = await box(page, NUMBER);
      const actions = await box(page, "[data-hero='actions']");
      file.release();
      await expect(page.locator(NUMBER)).toHaveText(COUNT);
      expect((await box(page, NUMBER)).height).toBe(number.height);
      const after = await box(page, "[data-hero='actions']");
      expect(after.y).toBe(actions.y);
      expect(after.x, "the actions beside the line do not slide: a 3-digit count fills the figure's room").toBe(
        actions.x,
      );
      expect(await shifted(page)).toBeLessThan(0.01);
    });
  });
}

// The phone rule (D13711, D13720): a phone has no home page; its home is the Earth's general room, the full chat alone, so even where the
// scene could run (`?test-gpu`) it draws no scene and offers no View in space. Its chat reads the worlds' file, as a computer's does.
test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the home opens the Earth's general room, with no View in space and no scene", async ({ page }) => {
    // A first visit's welcome card is not the page under test: it is told away.
    await page.addInitScript(() => {
      localStorage.setItem("gnoworld:welcomed", "1");
    });
    await served(page);
    await page.goto("/?test-gpu");
    await hydrated(page);
    await expect(page).toHaveURL(/\/earth\?chat=full$/);
    await expect(page.locator("h1")).toHaveText("#general");
    await page.waitForLoadState("load");
    await expect(page.locator(NUMBER)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "View in space" })).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.has(globalThis, "__gnoworldSpace")), "no scene ran").toBe(false);
    await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
  });
});

test.describe("with the scene", () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 1728, height: 1080 } });
  const SLOW = { timeout: 90_000 };
  const drawsTheFile = async (page: Page) => {
    await running(page);
    await expect.poll(() => worldsDrawn(page), SLOW).toBeGreaterThan(1);
  };

  test("the cosmos reads the worlds' file once, and the hero says the number it draws", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const file = await served(page);
    await page.goto("/?test-gpu");
    await hydrated(page);
    await drawsTheFile(page);
    await expect(page.locator(NUMBER)).toHaveText(COUNT);
    expect(String(await worldsDrawn(page))).toBe(COUNT);
    expect(file.worlds()).toBe(1);
    expect(file.count()).toBe(1);
  });

  test("on the way home from the Earth's page, the scene already there reads the worlds' file once", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const file = await served(page);
    await page.goto("/earth?test-gpu");
    await hydrated(page);
    await running(page);
    // The engine reads the worlds' file as it starts, on any page that shows space; the hero's count is asked by the home alone.
    await expect.poll(() => file.worlds(), SLOW).toBe(1);
    expect(file.count()).toBe(0);
    await page.getByRole("link", { name: "gnoworld" }).click();
    // The router moves once the home's data is in: 6.6 s measured with the scene in software GL on parallel workers.
    await expect(page).toHaveURL(/\/$/, SLOW);
    await drawsTheFile(page);
    await expect(page.locator(NUMBER)).toHaveText(COUNT);
    expect(file.worlds()).toBe(1);
  });
});
