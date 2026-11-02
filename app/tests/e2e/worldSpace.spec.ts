import AxeBuilder from "@axe-core/playwright";
import { worldLook } from "../../../packages/core/src/planet/look.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { brightness } from "./geometry.ts";
import { countShifts, opened, shaderRefusals, shifted, stats } from "./sceneStage.ts";

// A world's page in space (frames 20 to 35, 90 to 107, 115 to 125) on the gate's software GPU, under the page's real CSP: the world's
// planet in the circle the page keeps beside the plate, the page tinted with its colour, its rooms as moons clear of the plate, and the
// chat, which now comes after the load and the door, arriving and working. The canvas is not pixel-compared (the plan, section 6).
const COMPUTER = { width: 1728, height: 1080 };
const SLOW = { timeout: 90_000 };
// The planet, its air, the status ring and its moon, four moons, the aurora, the storms, the shadows: this part's budget.
const DRAWS_AT_MOST = 40;
const hexOf = ([red, green, blue]: readonly [number, number, number]) =>
  `#${[red, green, blue]
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

test.describe.configure({ timeout: 180_000 });

interface WorldStats {
  state: string;
  centre: { x: number; y: number; radius: number };
  moons: { room: string; x: number; y: number; shown: boolean }[];
  shadows: number;
}
const world = async (page: Page) => ((await stats(page)) as unknown as { world: WorldStats | undefined }).world;
const drawn = (page: Page) => expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
// A guest's chat, come and running: its room's name, and the line that asks a guest to log in to write.
const chatIn = async (page: Page, room: string) => {
  await expect(page.locator("#chat").getByRole("heading", { name: `#${room}` })).toBeVisible(SLOW);
  await expect(page.locator("#chat").getByText("Log in to write in this room.")).toBeVisible();
};

// The world's centre where the page keeps its circle's.
async function centredInItsCircle(page: Page, shown: WorldStats | undefined) {
  const globe = await page.locator("[data-globe]").boundingBox();
  if (globe === null || shown === undefined) throw new Error("no circle, or no world");
  expect(Math.abs(shown.centre.x - (globe.x + globe.width / 2))).toBeLessThan(2);
  expect(Math.abs(shown.centre.y - (globe.y + globe.height / 2))).toBeLessThan(2);
}

// The canvas is not blank: the world's day side is lit where the deep black over it is not, once a frame has drawn it.
async function notBlank(page: Page, shown: WorldStats | undefined) {
  const { x, y, radius } = shown?.centre ?? { x: 0, y: 0, radius: 0 };
  const lit = async () => {
    const [day = 0, space = 0] = await brightness(page, await page.screenshot(), [
      [x + radius * 0.45, y - 6, 12, 12],
      [x, y - radius * 1.25, 12, 12],
    ]);
    return day - space;
  };
  await expect.poll(lit, SLOW).toBeGreaterThan(8);
}

async function visit(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  await hydrated(page);
}

test.describe("a computer", () => {
  test.use({ viewport: COMPUTER });

  for (const slug of ["bubble", "govdao"])
    test(`draws ${slug}'s planet in the page's circle, with no CSP violation and no shader refused`, async ({
      page,
    }) => {
      const refused = shaderRefusals(page);
      await visit(page, `/w/${slug}?test-gpu`);
      await drawn(page);
      await opened(page);
      const shown = await world(page);
      expect(refused).toEqual([]);
      expect(shown?.state).toBe("drawn");
      await centredInItsCircle(page, shown);
      expect((await stats(page)).calls).toBeLessThanOrEqual(DRAWS_AT_MOST);
      await notBlank(page, shown);
    });

  test("tints the plate with the world's own colour once its planet is drawn", async ({ page }) => {
    await visit(page, "/w/govdao?test-gpu");
    await drawn(page);
    const tint = await page
      .locator("[data-globe] + *")
      .evaluate((layout) => getComputedStyle(layout).getPropertyValue("--world"));
    expect(tint.trim()).toBe(hexOf(worldLook("gov/dao").ramp[1]));
  });

  test("orbits the room you are in as a moon, clear of the plate, and a moon's link joins its room", async ({
    page,
  }) => {
    await visit(page, "/w/bubble?test-gpu");
    await drawn(page);
    await chatIn(page, "bubble");
    const moons = page.getByRole("navigation", { name: "Rooms in orbit" }).getByRole("link");
    await expect(moons.first()).toBeVisible(SLOW);
    // The plate's words end where its text does: no moon stands over them.
    const words = await page
      .locator("[data-look='plate'] :is(h1, h2, p, a, button)")
      .evaluateAll((all) => Math.max(...all.map((each) => each.getBoundingClientRect().right)));
    for (const moon of await moons.all()) {
      const spot = await moon.boundingBox();
      if (spot !== null) expect(spot.x).toBeGreaterThanOrEqual(words + 8);
    }
    await expect(moons.filter({ hasText: "#bubble" })).toHaveCount(1);
    await moons.filter({ hasText: "#games" }).click();
    await expect(page).toHaveURL(/room=games/);
    await chatIn(page, "games");
  });

  test("casts real shadows on the one world seen close, inside the draw budget", async ({ page }) => {
    await visit(page, "/w/bubble?test-gpu");
    await drawn(page);
    await expect.poll(async () => (await world(page))?.moons.length ?? 0, SLOW).toBeGreaterThan(0);
    await expect.poll(async () => (await world(page))?.shadows ?? 0).toBeGreaterThan(0);
    expect((await stats(page)).calls).toBeLessThanOrEqual(DRAWS_AT_MOST);
  });

  test("passes axe with the world in space", async ({ page }) => {
    await visit(page, "/w/govdao?test-gpu");
    await drawn(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

// The chat waits for the load and the door now (budgets.spec.ts, "a page that holds the door"): it must still come, work, and hold its
// place while it comes, so nothing moves under the reader (the chief's conditions, 2026-11-02).
for (const viewport of [COMPUTER, { width: 390, height: 844 }])
  test.describe(`the chat after the door, at ${String(viewport.width)} px`, () => {
    test.use({ viewport });

    for (const slug of ["bubble", "govdao"])
      test(`comes on ${slug}'s page after the load, works, and moves nothing while it comes`, async ({ page }) => {
        await countShifts(page);
        await page.goto(`/w/${slug}`);
        await hydrated(page);
        await chatIn(page, slug);
        expect(await shifted(page)).toBeLessThan(0.05);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      });
  });
