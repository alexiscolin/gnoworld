import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { brightness, colours } from "./geometry.ts";
import { countShifts, keepsItsRoom, opened, shaderRefusals, shifted, stats } from "./sceneStage.ts";

// A world's page in space (frames 20 to 35, 90 to 107, 115 to 125) on the gate's software GPU, under the page's real CSP: the world's
// planet in the circle the page keeps beside the plate, the page tinted with its colour, its rooms as moons clear of the plate, and the
// chat, which now comes after the load and the door, arriving and working. The canvas is not pixel-compared (the plan, section 6).
const COMPUTER = { width: 1728, height: 1080 };
const SLOW = { timeout: 90_000 };
// Measured on the software GPU (2026-11-02), the halo and the star's haze drawn: 14 draws for Bubble with three moons, 12 for GovDAO with
// one, so 11 and one a moon. Four moons and the ring's tube, moon and glow: 19, this part's budget (7e's review, B2-3).
const DRAWS_AT_MOST = 19;
// A square of `side` px centred on a point, as the colour helpers read a box: [x0, y0, x1, y1], whole pixels.
const around = (x: number, y: number, side: number): [number, number, number, number] => [
  Math.round(x - side / 2),
  Math.round(y - side / 2),
  Math.round(x + side / 2),
  Math.round(y + side / 2),
];
// A colour's lightness in HSL, 0 to 1.
const lightness = (hex: string) => {
  const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  return (Math.max(...channels) + Math.min(...channels)) / 2;
};

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
      around(x + radius * 0.45, y, 12),
      around(x - radius * 0.3, y - radius * 1.6, 12),
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

  test("tints the plate with the world's own hue, lit enough to show, and paints it again in the circle it opens", async ({
    page,
  }) => {
    await visit(page, "/w/govdao?test-gpu");
    await drawn(page);
    await opened(page);
    const tint = await page
      .locator("[data-globe] + *")
      .evaluate((layout) => getComputedStyle(layout).getPropertyValue("--world"));
    expect(tint.trim()).toMatch(/^#[0-9a-f]{6}$/);
    expect(lightness(tint.trim())).toBeGreaterThanOrEqual(0.55);
    // Just inside and just outside the circle's edge on the plate's side, the plate is the same colour (design review, 3).
    const shown = await world(page);
    const { x, y } = shown?.centre ?? { x: 0, y: 0 };
    // The hole's radius in pixels: a custom property computes to its text, so a box of that width reads it.
    const hole = await page.locator("[data-globe] + *").evaluate((layout) => {
      const probe = document.createElement("div");
      probe.style.position = "absolute";
      probe.style.inlineSize = "var(--globe-hole)";
      layout.append(probe);
      const { width } = probe.getBoundingClientRect();
      probe.remove();
      return width;
    });
    expect(hole).toBeGreaterThan(0);
    // The circle's edge 0.6 of its radius below its middle, on the plate's side.
    const edge = x - hole * Math.sqrt(1 - 0.6 * 0.6);
    await expect
      .poll(async () => {
        const [inside = [0, 0, 0], outside = [0, 0, 0]] = await colours(page, await page.screenshot(), [
          around(edge + 8, y + hole * 0.6, 4),
          around(edge - 8, y + hole * 0.6, 4),
        ]);
        return Math.max(...inside.map((channel, at) => Math.abs(channel - (outside[at] ?? 0))));
      }, SLOW)
      .toBeLessThan(6);
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
    // Each moon in view casts (7e's review, B2-4).
    await expect.poll(async () => (await world(page))?.shadows ?? 0).toBe((await world(page))?.moons.length ?? -1);
    expect((await stats(page)).calls).toBeLessThanOrEqual(DRAWS_AT_MOST);
  });

  test("passes axe with the world in space", async ({ page }) => {
    await visit(page, "/w/govdao?test-gpu");
    await drawn(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
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
