import { readFileSync } from "node:fs";
import type { Locator } from "@playwright/test";
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
const stations = (page: Page) => page.getByRole("navigation", { name: "The stations round the Earth" });
// A control's height and whether it is rounded whole, as the pill's views are.
const shapeOf = (control: Locator) =>
  control.evaluate((element) => {
    const { height } = element.getBoundingClientRect();
    return { height, round: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) >= height / 2 };
  });

test("offers space's two views in the header's pill, V toggling them, and the Earth's top view naming gnosh.ai's station", async ({
  page,
}) => {
  await home(page);
  expect(await pressed(page)).toEqual(["true", "false"]);
  // The design review (F4472): the selected icon a pill as the selected view, the view links' 34 px rounded whole, and so the other.
  const view = await shapeOf(page.getByRole("banner").locator("[aria-current='page']"));
  expect(view).toEqual({ height: 34, round: true });
  for (const name of ["Dynamic view", "Plan view"])
    expect(await shapeOf(views(page).getByRole("button", { name }))).toEqual(view);
  await page.keyboard.press("v");
  expect(await pressed(page)).toEqual(["false", "true"]);
  // The Earth's top view (7x2): its stations' orbits drawn, and gnosh.ai's station named among the team's projects, a link to its world's
  // page in this tab, never the project's site (8l; Alexis, 2026-11-05), not a system's Plan's first click that names.
  await expect.poll(async () => (await stats(page)).cosmos?.stations?.orbits, SLOW).toBe(true);
  const gnosh = stations(page).getByRole("link", { name: "gnosh.ai", exact: true });
  await expect(gnosh).toBeVisible(SLOW);
  await expect(gnosh).toHaveAttribute("href", "/w/gnosh-ai");
  await expect(gnosh).not.toHaveAttribute("target", /./);
  await views(page).getByRole("button", { name: "Dynamic view" }).click();
  expect(await pressed(page)).toEqual(["true", "false"]);
  await expect.poll(async () => (await stats(page)).cosmos?.stations?.orbits, SLOW).toBe(false);
  // Every shader compiles, three's and ours, their spaces stripped at build.
});

test("names the system the eye comes to in option B's card, gives it the screen, and goes back a step from the crumb", async ({
  page,
}) => {
  await home(page);
  await expect(page.locator("[data-hero]").first()).toBeVisible();
  await arrive(page, "gnoswap");
  const crumb = page.getByRole("navigation", { name: "Where you are" });
  await expect(crumb.getByRole("listitem")).toHaveText(["Cosmos", "System"], SLOW);
  // The GUI board's option B (F4472): the system's name the page's heading under the kicker, then its worlds and its network.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("gnoswap");
  await expect(page.getByText("16 worlds · a namespace on Onyx")).toBeVisible();
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
  // Every named world standing: a body shows once its maps and programs came, a while after its name.
  const words = await names(page).allTextContents();
  await expect
    .poll(async () => {
      const standing = new Set((await stats(page)).cosmos?.screen.bodies.map(({ id }) => id.split("/").at(-1)));
      return words.filter((word) => !standing.has(word));
    }, SLOW)
    .toEqual([]);
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
  // The mock-up's names (7v's design review, F4470): 17 px, in the hero line's grey, #c8d0de; on the star's glow a dark halo of the page's
  // space round each letter, where "wugnot" stood at 2.6:1 on #a37549 (the second pass).
  const [style] = await names(page).evaluateAll((all) =>
    all
      .slice(0, 1)
      .map((element) => [
        getComputedStyle(element).fontSize,
        getComputedStyle(element).color,
        getComputedStyle(element).textShadow,
      ]),
  );
  expect(style?.slice(0, 2)).toEqual(["17px", "rgb(200, 208, 222)"]);
  expect(style?.[2]).toContain("rgb(5, 7, 13)");
  const linked = names(page).and(page.locator("[href^='/r/']")).first();
  const href = (await linked.getAttribute("href")) ?? "";
  await linked.click();
  await expect(linked).toHaveAttribute("aria-current", "true");
  expect(new URL(page.url()).pathname).toBe("/");
  await linked.click();
  await expect.poll(() => new URL(page.url()).pathname, SLOW).toBe(href);
});

// F4691: on a phone the views bar broke its names under the two icons ("EART H", "COSMO S", "LIS T", in 283a3b45's approved picture). Each
// view's name stands on one line, at 390 and 320 px; the icons only once a scene runs, after View in space, in a pill of their own over the
// scene, off the bar and inside the screen.
const linesOfNames = (page: Page) =>
  page
    .getByRole("navigation", { name: "Views" })
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => {
        const range = document.createRange();
        range.selectNodeContents(link);
        return range.getClientRects().length;
      }),
    );
for (const width of [390, 320])
  test(`stands each view's name on one line on a phone ${String(width)} px wide, space's two views only once it shows, off the bar`, async ({
    page,
  }) => {
    await page.route("**/worlds.json", (route) =>
      route.fulfill({ status: 200, body: RECORDED, contentType: "application/json" }),
    );
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(HOME);
    await hydrated(page);
    expect(await linesOfNames(page)).toEqual([1, 1, 1]);
    await expect(views(page)).toHaveCount(0);
    await page.getByRole("button", { name: "View in space" }).click();
    await running(page);
    await expect(views(page)).toBeVisible(SLOW);
    expect(await linesOfNames(page)).toEqual([1, 1, 1]);
    const [bar, group] = await Promise.all([
      page.getByRole("navigation", { name: "Views" }).boundingBox(),
      views(page).boundingBox(),
    ]);
    if (bar === null || group === null) throw new Error("no bar or no views of space on the screen");
    expect(group.y + group.height).toBeLessThanOrEqual(bar.y);
    expect(group.x).toBeGreaterThanOrEqual(0);
    expect(group.x + group.width).toBeLessThanOrEqual(width);
  });
