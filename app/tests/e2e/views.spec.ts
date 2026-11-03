import { readFileSync } from "node:fs";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { landed, running, stats } from "./sceneStage.ts";

// A system's two views and the Earth's (7v; Alexis, 2026-11-03, the mock-ups he approved and the GUI board's option B), on the gate's software
// GPU, from Onyx's recorded file: the header's two icons and V for how one looks, the Plan's names under its worlds, a first click naming
// one and a second going there, the crumb back to the cosmos at a system. The scene is driven as 7g2's flights will, through its own call.
const HOME = "/?test-gpu";
const COMPUTER = { width: 1728, height: 1080 };
const RECORDED = readFileSync(new URL("../../lab/worlds.json", import.meta.url), "utf8");
const SLOW = { timeout: 90_000 };

test.describe.configure({ timeout: 180_000 });

async function home(page: Page) {
  await page.route("**/worlds.json", (route) =>
    route.fulfill({ status: 200, body: RECORDED, contentType: "application/json" }),
  );
  await page.setViewportSize(COMPUTER);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(HOME);
  await hydrated(page);
  await running(page);
  await landed(page);
}
const arrive = (page: Page, id: string | undefined) =>
  page.evaluate((to) => {
    (Reflect.get(globalThis, "__gnoworldScene") as { arrive: (id: string | undefined) => void }).arrive(to);
  }, id);
const views = (page: Page) => page.getByRole("group", { name: "Views of space" });
const pressed = async (page: Page) =>
  Promise.all(
    ["Dynamic view", "Plan view"].map((name) => views(page).getByRole("button", { name }).getAttribute("aria-pressed")),
  );
const names = (page: Page) => page.locator("[data-plan] a");

test("offers space's two views in the header's pill, V toggling them, and the Earth's Plan at rest naming gnosh.ai", async ({
  page,
}) => {
  await home(page);
  expect(await pressed(page)).toEqual(["true", "false"]);
  await page.keyboard.press("v");
  expect(await pressed(page)).toEqual(["false", "true"]);
  // The file the team reviews: gnosh.ai among its projects, a link to its own address in a tab of its own.
  const gnosh = names(page).filter({ hasText: "gnosh.ai" });
  await expect(gnosh).toHaveCount(1, SLOW);
  await expect(gnosh).toHaveAttribute("href", "https://gnosh.ai");
  await expect(gnosh).toHaveAttribute("target", "_blank");
  const popups: unknown[] = [];
  page.on("popup", (popup) => popups.push(popup));
  await gnosh.click();
  await expect(gnosh).toHaveAttribute("aria-current", "true");
  expect(popups).toEqual([]);
  await views(page).getByRole("button", { name: "Dynamic view" }).click();
  expect(await pressed(page)).toEqual(["true", "false"]);
  await expect(names(page)).toHaveCount(0, SLOW);
  // Every shader compiles, three's and ours, their spaces stripped at build.
});

test("names the system the eye comes to, '← Cosmos › gnoswap', gives it the screen, and goes back a step from the crumb", async ({
  page,
}) => {
  await home(page);
  await expect(page.locator("[data-hero]").first()).toBeVisible();
  await arrive(page, "gnoswap");
  const crumb = page.getByRole("navigation", { name: "Where you are" });
  await expect(crumb.getByRole("listitem")).toHaveText(["Cosmos", "gnoswap"], SLOW);
  await expect(page.locator("[data-hero]")).toHaveCount(0);
  await crumb.getByRole("button", { name: "Cosmos" }).click();
  await expect(crumb).toHaveCount(0, SLOW);
  await expect(page.locator("[data-hero]").first()).toBeVisible();
  await expect.poll(async () => (await stats(page)).cosmos?.screen.earth?.x ?? NaN, SLOW).toBeCloseTo(864, 0);
});

test("draws gnoswap's Plan with a name under each world, names one at a click, and goes to its realm's view at a second", async ({
  page,
}) => {
  await home(page);
  await arrive(page, "gnoswap");
  await page.keyboard.press("v");
  await expect.poll(async () => names(page).count(), SLOW).toBeGreaterThanOrEqual(3);
  const shown = await stats(page);
  const bodies = new Map((shown.cosmos?.screen.bodies ?? []).map((body) => [body.id.split("/").at(-1), body]));
  for (const name of await names(page).all()) {
    const word = (await name.textContent()) ?? "";
    const body = bodies.get(word);
    const at = await name.boundingBox();
    expect(body, word).toBeDefined();
    if (body === undefined || at === null) continue;
    // Centred under its world, a few pixels under its outline.
    expect(Math.abs(at.x + at.width / 2 - body.x)).toBeLessThan(4);
    expect(at.y).toBeGreaterThan(body.y + body.radius - 2);
    expect(at.y).toBeLessThan(body.y + body.radius + 24);
  }
  const linked = names(page).and(page.locator("[href^='/r/']")).first();
  const href = (await linked.getAttribute("href")) ?? "";
  await linked.click();
  await expect(linked).toHaveAttribute("aria-current", "true");
  expect(new URL(page.url()).pathname).toBe("/");
  await linked.click();
  await expect.poll(() => new URL(page.url()).pathname, SLOW).toBe(href);
});
