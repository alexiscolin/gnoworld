import { readFileSync } from "node:fs";
import { COUNTED, expect, hydrated, test, type Page } from "./fixtures.ts";
import { box } from "./geometry.ts";
import { countShifts, running, shifted, stats } from "./sceneStage.ts";

// The hero's number (7n, 7n2): the worlds the cosmos draws, read from the count the job writes beside the worlds' file, so a home whose scene
// does not run keeps it (no WebGL; this browser's software GPU without `?test-gpu`) and a phone asks nothing of the cosmos before View in space.
// The host serves neither file (the job writes them): each test serves Onyx's recorded file and its count.
const RECORDED = readFileSync(new URL("../recordedWorlds.json", import.meta.url), "utf8");
const NUMBER = "[data-hero='number']";
// The recorded file's 533 worlds, each once in its namespace, and the Earth: written out, so a counting fault cannot move it with the page
// nor with the count the fixtures serve.
const COUNT = "534";

// Serves the recorded file and its count, and counts the requests for each; a held count answers only once `release` is called, and a
// missing one is the host's 404, as a deployment's before the job's first pass.
async function served(page: Page, { held = false, missing = false } = {}) {
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
    await (missing
      ? route.fulfill({ status: 404 })
      : route.fulfill({ body: COUNTED, contentType: "application/json" }));
  });
  return { worlds: () => asked.worlds, count: () => asked.count, release };
}

for (const width of [390, 1280]) {
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
      expect(await page.evaluate(() => Reflect.has(globalThis, "__gnoworldScene")), "no scene ran").toBe(false);
      await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
      expect(file.count()).toBe(1);
      // The page preloads the worlds' file for what is not a phone (routes/home.tsx's links), once, whether the scene runs or not.
      expect(file.worlds()).toBe(width === 390 ? 0 : 1);
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

// The phone rule (7n2): a phone gets nothing of the cosmos until View in space, the worlds' file included, and keeps its number all the same.
test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.describe.configure({ timeout: 180_000 });
  // The home before View in space, its line as `line` says, and the scene's one read of the worlds' file once the button is pressed.
  const beforeTheButton = async (page: Page, missing: boolean, line: string) => {
    const file = await served(page, { missing });
    await page.goto("/?test-gpu");
    await hydrated(page);
    const view = page.getByRole("button", { name: "View in space" });
    await expect(view).toBeVisible();
    await expect(page.locator("h1")).toHaveText(line);
    await page.waitForLoadState("load");
    expect(file.count()).toBe(1);
    expect(file.worlds(), "no worlds' file before View in space").toBe(0);
    await view.click();
    await running(page);
    await expect.poll(() => file.worlds(), { timeout: 90_000 }).toBe(1);
    await expect(page.locator(NUMBER)).toHaveText(COUNT);
  };

  test("shows the number and asks no worlds' file before View in space, then the scene asks it once", async ({
    page,
  }) => {
    await beforeTheButton(page, false, `${COUNT} worlds in Onyx`);
  });

  test("with no count served, names the worlds without a number and still asks no worlds' file before View in space", async ({
    page,
  }) => {
    await beforeTheButton(page, true, "Worlds in Onyx");
  });
});

test.describe("with the scene", () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 1728, height: 1080 } });
  const SLOW = { timeout: 90_000 };
  const drawsTheFile = async (page: Page) => {
    await running(page);
    await expect.poll(async () => (await stats(page)).cosmos?.worlds ?? 0, SLOW).toBeGreaterThan(1);
  };

  test("the cosmos reads the worlds' file once, and the hero says the number it draws", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const file = await served(page);
    await page.goto("/?test-gpu");
    await hydrated(page);
    await drawsTheFile(page);
    await expect(page.locator(NUMBER)).toHaveText(COUNT);
    expect(String((await stats(page)).cosmos?.worlds)).toBe(COUNT);
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
    expect(file.worlds()).toBe(0);
    expect(file.count()).toBe(0);
    await page.getByRole("link", { name: "gnoworld" }).click();
    await expect(page).toHaveURL(/\/$/);
    await drawsTheFile(page);
    await expect(page.locator(NUMBER)).toHaveText(COUNT);
    expect(file.worlds()).toBe(1);
  });
});
