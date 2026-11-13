import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { goInPage, labelsOf, landed, running, shownLabels } from "./sceneStage.ts";

// The universe's names (D401, the demo's pills), read off the engine's own layer (`options.labels`): text, never an address; a door where
// one shows and no pointer where none does; none over a page that frames its planet. On the software GPU, with the recorded worlds' file.
const HOME = "/?test-gpu";
const COMPUTER = { width: 1728, height: 1080 };
const LAPTOP = { width: 1280, height: 800 };
const RECORDED = readFileSync(new URL("../recordedWorlds.json", import.meta.url), "utf8");
const ADDRESS = /g1[023456789acdefghjklmnpqrstuvwxyz]{38}/;
const SLOW = { timeout: 90_000 };

test.describe.configure({ timeout: 180_000 });

async function arrived(page: Page, size = COMPUTER) {
  await page.route("**/worlds.json", (route) => route.fulfill({ body: RECORDED, contentType: "application/json" }));
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(HOME);
  await hydrated(page);
  await running(page);
  await landed(page);
}

// The names a view at rest shows, once they stand and none is part of the way through its fade (a dimmed one stands at 0.3).
async function settled(page: Page) {
  await expect.poll(async () => (await shownLabels(page)).length, SLOW).toBeGreaterThan(0);
  await expect
    .poll(async () => (await labelsOf(page)).every(({ opacity }) => opacity < 0.01 || opacity > 0.29), SLOW)
    .toBe(true);
  return shownLabels(page);
}

test("names what the view at rest draws, never by an address", async ({ page }) => {
  await arrived(page);
  const shown = await settled(page);
  for (const { text } of shown) {
    expect(text.trim()).not.toBe("");
    expect(text).not.toMatch(ADDRESS);
  }
});

// ADR-0003, 2e: a shown label is a door to its world; a hidden one takes no pointer, so every other click goes through to the cosmos.
test("lets every click through to the cosmos but where a shown label stands: a hidden label takes no pointer", async ({
  page,
}) => {
  await arrived(page);
  await settled(page);
  const labels = await labelsOf(page);
  for (const { opacity, pointer } of labels) expect(pointer).toBe(opacity > 0.01 ? "auto" : "none");
  expect(labels.some(({ opacity }) => opacity > 0.01)).toBe(true);
});

test("shows no label where the cosmos is covered: the Earth's page and a world's keep their plate clear", async ({
  page,
}) => {
  await arrived(page);
  await settled(page);
  await goInPage(page, "/earth");
  await expect(page.locator("[data-earth='drawn']")).toBeAttached(SLOW);
  await expect.poll(async () => (await shownLabels(page)).length, SLOW).toBe(0);
  await page.goto("/w/govdao?test-gpu");
  await hydrated(page);
  await running(page);
  await expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
  await expect.poll(async () => (await shownLabels(page)).length, SLOW).toBe(0);
});

test("leaves the home's axe check clean with its labels standing, at 1280 px", async ({ page }) => {
  await arrived(page, LAPTOP);
  await settled(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
