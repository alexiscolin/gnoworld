import { expect, hydrated, scriptsAsked, test, type Page } from "./fixtures.ts";
import { flightOf } from "./sceneStage.ts";

// gnosh's colony (D13740): on its own orbit round gno.land's sun, a world wherever worlds show, its code a chunk of its own that no first
// screen asks. On the gate's software GPU.
const SLOW = { timeout: 90_000 };
const COLONY = /\/assets\/gnoshColony-[\w-]+\.js$/;
const SCENE = /\/assets\/scene-[\w-]+\.js$/;

test.describe.configure({ timeout: 180_000 });

async function visit(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  await hydrated(page);
}

test.describe("on a computer's screen", () => {
  test.use({ viewport: { width: 1491, height: 932 } });

  // The scene comes after a page's text, and the colony's code after the scene, which asks it once the colony is wanted near (the home
  // system's worlds are made ahead): never with a first screen.
  test("asks the colony's code after the scene's on the home and the Earth, never with their first screen", async ({ page }) => {
    for (const [path, drawn] of [
      ["/?test-gpu", "[data-arrival='drawn']"],
      ["/earth?test-gpu", "[data-earth='drawn']"],
    ] as const) {
      const scripts = scriptsAsked(page);
      await visit(page, path);
      await expect(page.locator(drawn)).toBeAttached(SLOW);
      const scene = scripts.findIndex((url) => SCENE.test(url));
      const colony = scripts.findIndex((url) => COLONY.test(url));
      expect(scene, path).toBeGreaterThanOrEqual(0);
      expect(colony === -1 || colony > scene, path).toBe(true);
    }
  });

  test("names the colony in gno.land's system and draws it there, its code asked then", async ({ page }) => {
    const scripts = scriptsAsked(page);
    await visit(page, "/s/gnoland?test-gpu");
    await expect(page.getByRole("button", { name: /^gnosh\.ai/ })).toBeVisible(SLOW);
    await expect.poll(() => scripts.filter((url) => COLONY.test(url)).length, SLOW).toBe(1);
  });

  test("stands the colony in its page's circle, as a world's", async ({ page }) => {
    await visit(page, "/w/gnosh-ai?test-gpu");
    await expect(page.locator("h1")).toHaveText("gnosh.ai", SLOW);
    await expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
    await expect.poll(async () => (await flightOf(page)).id, SLOW).toBe("gnosh-ai");
  });

  test("lists the colony among the worlds of the full chat and its search's stations, its rooms #general, #help and #showcase", async ({
    page,
  }) => {
    await visit(page, "/w/gnosh-ai?chat=full");
    await expect(page.getByRole("link", { name: /gnosh\.ai/ }).first()).toBeVisible(SLOW);
    await expect(page.getByRole("heading", { name: /#general/ })).toBeVisible(SLOW);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("combobox", { name: "Search places" }).fill("gnosh");
    await expect(page.getByRole("option", { name: /^gnosh\.ai/ })).toBeVisible(SLOW);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("puts the colony in the worlds row", async ({ page }) => {
    await visit(page, "/w/gnosh-ai?chat=full");
    await expect(page.getByRole("link", { name: /gnosh\.ai/ }).first()).toBeVisible(SLOW);
  });
});
