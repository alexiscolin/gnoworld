import { readFileSync } from "node:fs";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { box } from "./geometry.ts";
import { countShifts, running, shifted, stats } from "./sceneStage.ts";

// The hero's number (7n): the worlds the cosmos draws, counted from the worlds' file the page reads itself, so a home whose scene does not run
// keeps it: no WebGL, a GPU the page refuses (these browsers' software one, without `?test-gpu`), a phone before View in space. The scene,
// when it runs, takes the page's read. The host serves no worlds.json (the server's job writes it), so each test serves Onyx's recorded one.
const RECORDED = readFileSync(new URL("../../lab/worlds.json", import.meta.url), "utf8");
const NUMBER = "[data-hero='number']";
// The recorded file's 533 worlds, each once in its namespace, and the Earth: written out, so a counting fault cannot move it with the page.
const COUNT = "534";

// Serves the recorded file and counts the requests for it; a held file answers only once `release` is called.
async function served(page: Page, held = false) {
  let asked = 0;
  let release: () => void = () => undefined;
  const released = new Promise<void>((done) => {
    release = done;
  });
  if (!held) release();
  await page.route("**/worlds.json", async (route) => {
    asked += 1;
    await released;
    await route.fulfill({ body: RECORDED, contentType: "application/json" });
  });
  return { asked: () => asked, release };
}

for (const width of [390, 1280]) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("the home without the scene keeps its number, from the worlds' file", async ({ page }) => {
      const file = await served(page);
      await page.goto("/");
      await hydrated(page);
      await expect(page.locator(NUMBER)).toHaveText(COUNT);
      await expect(page.locator("h1")).toHaveText(`${COUNT} worlds in Onyx`);
      expect(await page.evaluate(() => Reflect.has(globalThis, "__gnoworldScene")), "no scene ran").toBe(false);
      await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
      expect(file.asked()).toBe(1);
    });

    test("the hero keeps its number's room while the file comes: nothing on the page moves", async ({ page }) => {
      await countShifts(page);
      const file = await served(page, true);
      await page.goto("/");
      await hydrated(page);
      await expect.poll(() => file.asked()).toBe(1);
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

test.describe("with the scene", () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 1728, height: 1080 } });
  const SLOW = { timeout: 90_000 };
  const drawsTheFile = async (page: Page) => {
    await running(page);
    await expect.poll(async () => (await stats(page)).cosmos?.worlds ?? 0, SLOW).toBeGreaterThan(1);
  };

  test("one read of the worlds' file serves the hero's number and the cosmos", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const file = await served(page);
    await page.goto("/?test-gpu");
    await hydrated(page);
    await drawsTheFile(page);
    await expect(page.locator(NUMBER)).toHaveText(COUNT);
    expect(file.asked()).toBe(1);
  });

  test("on the way home from the Earth's page, the scene already there takes the page's read", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const file = await served(page);
    await page.goto("/earth?test-gpu");
    await hydrated(page);
    await running(page);
    expect(file.asked()).toBe(0);
    await page.getByRole("link", { name: "gnoworld" }).click();
    await expect(page).toHaveURL(/\/$/);
    await drawsTheFile(page);
    await expect(page.locator(NUMBER)).toHaveText(COUNT);
    expect(file.asked()).toBe(1);
  });
});
