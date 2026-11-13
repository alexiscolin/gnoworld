import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import type { Space } from "../../src/space/scene.ts";
import { countShifts, keepsItsRoom, opened, shifted } from "./sceneStage.ts";

// A world's page in space (frames 20 to 35, 90 to 107, 115 to 125) on the gate's software GPU, under the page's real CSP: the world's
// planet in the circle the page keeps beside the plate, its rooms as moons clear of the plate, and the chat, which now comes after the load
// and the door, arriving and working. The canvas is not pixel-compared (the plan, section 6).
const COMPUTER = { width: 1728, height: 1080 };
const SLOW = { timeout: 90_000 };

test.describe.configure({ timeout: 180_000 });

const drawn = (page: Page) => expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
// A guest's chat, come and running: its room's name, and the line that asks a guest to log in to write.
const chatIn = async (page: Page, room: string) => {
  await expect(page.locator("#chat").getByRole("heading", { name: `#${room}` })).toBeVisible(SLOW);
  await expect(page.locator("#chat").getByText("Log in to write in this room.")).toBeVisible();
};

// Where the page's planet stands on screen, as the engine projects it: at rest on a page the rig looks at the planet's centre (move.ts).
const planetSpot = (page: Page) =>
  page.evaluate(() => {
    const { see, rig, planet } = Reflect.get(globalThis, "__gnoworldSpace") as Space;
    const on = { x: 0, y: 0, z: 0 };
    return planet !== undefined && !rig.flying && see.project(rig.pose.look, on) ? { x: on.x, y: on.y } : undefined;
  });

// The world's centre where the page keeps its circle's.
async function centredInItsCircle(page: Page) {
  const globe = await page.locator("[data-globe]").boundingBox();
  if (globe === null) throw new Error("no circle");
  const middle = { x: globe.x + globe.width / 2, y: globe.y + globe.height / 2 };
  await expect
    .poll(async () => {
      const spot = await planetSpot(page);
      return spot === undefined ? Infinity : Math.max(Math.abs(spot.x - middle.x), Math.abs(spot.y - middle.y));
    }, SLOW)
    .toBeLessThan(2);
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
      await visit(page, `/w/${slug}?test-gpu`);
      await drawn(page);
      await opened(page);
      await centredInItsCircle(page);
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

  test("passes axe with the world in space", async ({ page }) => {
    await visit(page, "/w/govdao?test-gpu");
    await drawn(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

// A world's planet takes the frames' sizes (Alexis, 2026-11-02, F4307): its circle is its busiest, frame 104's Bubble, 336 px of radius at
// 1728 by 1080, whose ring at 1.143 radii reaches the plate's words and the dock and never passes under them; a world at rest, as these are,
// is frame 22's quieter GovDAO, 172 px. The Earth's circle stays its own (earth.spec.ts).
const RING = 1.143;
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  COMPUTER,
  { width: 2560, height: 1440 },
])
  test.describe(`a world's size, at ${String(viewport.width)} by ${String(viewport.height)}`, () => {
    test.use({ viewport });

    test("keeps its busiest ring between the plate's words and the dock, and stands at rest as the frames do", async ({
      page,
    }) => {
      await visit(page, "/w/bubble?test-gpu");
      await drawn(page);
      await opened(page);
      const circle = await page.locator("[data-globe]").boundingBox();
      const dock = await page.locator("#chat").boundingBox();
      if (circle === null || dock === null) throw new Error("no circle, or no dock");
      const words = await page
        .locator("[data-look='plate'] :is(h1, h2, p, a, button)")
        .evaluateAll((all) => Math.max(...all.map((each) => each.getBoundingClientRect().right)));
      const radius = circle.width / 2;
      const middle = circle.x + radius;
      expect(middle - RING * radius, "the busiest ring clear of the plate's words").toBeGreaterThanOrEqual(words - 1);
      expect(middle + RING * radius, "the busiest ring clear of the dock").toBeLessThanOrEqual(dock.x + 1);
      // Within 10 px of frame 104: its edges read to about 3 px.
      if (viewport === COMPUTER) expect(Math.abs(radius - 336), "the busiest as frame 104's Bubble").toBeLessThan(10);
    });
  });

// A window this wide lays the planet's room out from the first paint, or the plate jumps under the reader as the world comes (7e's review,
// B2-2; the Earth's own journey holds the same for its globe).
for (const width of [1100, 1728])
  test.describe(`a world's room from the first paint, at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 1000 } });

    test("keeps the planet's room: the plate does not jump", async ({ page }) => {
      await keepsItsRoom(page, "/w/bubble?test-gpu", async (shown) => {
        await drawn(shown);
        await opened(shown);
      });
    });
  });

// A narrow chat's header (a dock's, a phone's) holds the rooms' control and the place on one row, the room's name and the close control on
// the next: rows that let the header's items fall where they fit change as its title's font or the control's chunk comes, and the chat moves
// under the reader (the 390 px journey below caught it, CLS 0.15, 2026-11-02).
test.describe("the chat's header at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps two rows: the place, then the room's name with the close control", async ({ page }) => {
    await page.goto("/w/bubble");
    await hydrated(page);
    const chat = page.locator("#chat");
    await expect(chat.getByRole("button", { name: "Rooms" })).toBeVisible(SLOW);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const place = await chat.locator("header p").first().boundingBox();
    const close = await chat.getByRole("button", { name: "Close the chat" }).boundingBox();
    const name = await chat.getByRole("heading", { name: "#bubble" }).boundingBox();
    if (place === null || close === null || name === null) throw new Error("no place, close control or room's name");
    expect(name.y, "the room's name under the place").toBeGreaterThanOrEqual(place.y + place.height - 1);
    const middle = close.y + close.height / 2;
    expect(middle, "the close control on the name's row").toBeGreaterThanOrEqual(name.y);
    expect(middle).toBeLessThanOrEqual(name.y + name.height);
  });
});

// A world whose chat counts nobody, its socket answering nothing: the plate's "here, right now" keeps its place, empty, and nothing moves
// (the chief, 2026-11-02: Bubble, GovDAO and a world with nobody, each under 0.05 at 390 px).
test.describe("a world with nobody counted, at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("holds the plate and the chat still", async ({ page }) => {
    await countShifts(page);
    await page.routeWebSocket(/\/ws$/, () => undefined);
    await page.goto("/w/bubble");
    await hydrated(page);
    await expect(page.locator("#chat").getByRole("heading", { name: "#bubble" })).toBeVisible(SLOW);
    await expect(page.getByText("right now")).toHaveCount(0);
    expect(await shifted(page)).toBeLessThan(0.05);
  });
});

// The chat waits for the load and the door, never for ever: a door whose chunk never answers leaves the chat to come 2.5 s after the page is on
// screen (F4306, the chief's call: a hung chunk, a refused WebGL or a slow network leaves no world without its chat).
test.describe("the chat with the door held back", () => {
  test("comes on bubble's page though the door's chunk never answers", async ({ page }) => {
    await page.route(/\/assets\/mountUniverse-[\w-]+\.js$/, () => undefined);
    await page.goto("/w/bubble");
    await hydrated(page);
    await expect(page.locator("#chat").getByRole("heading", { name: "#bubble" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#chat").getByText("Log in to write in this room.")).toBeVisible();
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
