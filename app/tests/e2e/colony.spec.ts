import { readFileSync } from "node:fs";
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

// gno.land's system as the live file can hold it: the recorded worlds and sixty more of its own, each called, so the colony, used by no
// one yet, is the last by use and its system's reach wide.
const RECORDED = JSON.parse(readFileSync(new URL("../recordedWorlds.json", import.meta.url), "utf8")) as {
  worlds: unknown[];
};
const CROWDED = JSON.stringify({
  ...RECORDED,
  worlds: [
    ...RECORDED.worlds,
    ...Array.from({ length: 60 }, (_, at) => ({
      id: `gnoland/w${String(at)}`,
      namespace: "gnoland",
      realms: [
        { path: `gno.land/r/gnoland/w${String(at)}`, functions: [], imports: [], calls: 5 + at, callers: 3 + at },
      ],
    })),
  ],
});

// The colony's name in the view, on screen: in the window and not past its edges.
async function namedOnScreen(page: Page) {
  const label = page.getByRole("button", { name: /^gnosh\.ai/ });
  await expect(label).toBeVisible(SLOW);
  const box = await label.boundingBox();
  const size = page.viewportSize();
  expect(
    box !== null &&
      size !== null &&
      box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= size.width &&
      box.y + box.height <= size.height,
  ).toBe(true);
}

test.describe("in gno.land's system as full as the live file holds it", () => {
  test.use({ viewport: { width: 1491, height: 932 } });

  for (const path of ["/s/gnoland?test-gpu", "/s/gnoland?view=map&test-gpu"])
    test(`names the colony on screen in ${path}`, async ({ page }) => {
      await page.route("**/worlds.json", (route) => route.fulfill({ body: CROWDED, contentType: "application/json" }));
      await visit(page, path);
      await namedOnScreen(page);
    });
});

test.describe("on a computer's screen", () => {
  test.use({ viewport: { width: 1491, height: 932 } });

  // The scene comes after a page's text, and the colony's code after the scene, which asks it once the colony is wanted near (the home
  // system's worlds are made ahead): never with a first screen.
  test("asks the colony's code after the scene's on the home and the Earth, never with their first screen", async ({
    page,
  }) => {
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

  // A planet's page frames it larger than the window; the colony's page stands it whole beside the plate, as the preview has it.
  test("stands the colony whole in its page's circle, not framed larger than the window as a planet is", async ({
    page,
  }) => {
    await visit(page, "/w/bubble");
    await expect(page.locator("[data-globe]")).toHaveAttribute("data-framing", "imposing");
    await visit(page, "/w/gnosh-ai?test-gpu");
    await expect(page.locator("[data-globe]")).not.toHaveAttribute("data-framing");
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
