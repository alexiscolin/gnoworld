import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { running } from "./sceneStage.ts";

// The rail (frame 4 and 16, 7i): the Earth, the trends, the rising worlds and the seeds as planets with their names down the right edge,
// 25 at most and "See all"; one stop in the tab order, the arrows among them; magnified like a dock under the pointer, never under reduced
// motion; each planet its own portrait. Frame 4's rail: x 1,585 to 1,703 at 1,728 px, y 98 to 1,024 at most, its planets 64 px, 98 apart.
const HOME = "/?test-gpu";
const COMPUTER = { width: 1728, height: 1080 };
const PHONE = { width: 390, height: 844 };
const FRAME = { left: 1585, right: 1703, top: 98, bottom: 1024, planet: 64, pitch: 98 };
const RECORDED = JSON.parse(readFileSync(new URL("../../lab/worlds.json", import.meta.url), "utf8")) as {
  worlds: { id: string; seen?: string | null; realms?: { callers: number | null }[] }[];
};
const SLOW = { timeout: 90_000 };
// Less than the rail's minute (railWorlds.ts): a first order held past the server's answer fails what waits for the full one.
const SOON = { timeout: 40_000 };
const ORDER = ["Earth", "GovDAO", "defi", "profile", "agents", "Bubble", "Uncharted signal", "Uncharted signal"];
const DAY = 86_400_000;
const MAGNIFIED = 1.55;

test.describe.configure({ timeout: 180_000 });

// Who is here: presence names the hubs alone (the Earth, GovDAO by its hub's slug, Bubble, which rises).
const PRESENT = [
  { world: "earth", here: 6, perHour: 40, rise: null },
  { world: "govdao", here: 12, perHour: 9, rise: null },
  { world: "bubble", here: 9, perHour: 2, rise: 1.4 },
];
// The recorded file (2026-11-01) counts no caller: three of its worlds are given callers here, as the live job's histories bring them.
const CALLED: Record<string, number> = {
  "demo/defi": 30,
  "demo/profile": 20,
  "g1magld5ptgzaktqcexxq0pgq5lmdf0kz6re8hlv/agents": 10,
};
// Two worlds the file saw yesterday, which nobody here visited: seeds.
const FRESH = ["g1magld5ptgzaktqcexxq0pgq5lmdf0kz6re8hlv/blog", "g1magld5ptgzaktqcexxq0pgq5lmdf0kz6re8hlv/config"];

type Recorded = (typeof RECORDED.worlds)[number];
// Given to the world's first realm, so a world counts what it is given.
const callersFor = (world: Recorded, callers: number | undefined) =>
  callers === undefined
    ? world
    : { ...world, realms: (world.realms ?? []).map((realm, at) => ({ ...realm, callers: at === 0 ? callers : null })) };

async function served(page: Page, { present = PRESENT, called = CALLED } = {}) {
  const yesterday = new Date(Date.now() - DAY).toISOString();
  const worlds = RECORDED.worlds.map((world) =>
    callersFor(FRESH.includes(world.id) ? { ...world, seen: yesterday } : world, called[world.id]),
  );
  await page.route("**/worlds.json", (route) =>
    route.fulfill({ body: JSON.stringify({ ...RECORDED, worlds }), contentType: "application/json" }),
  );
  await page.route("**/api/presence", (route) =>
    route.fulfill({ body: JSON.stringify({ worlds: present }), contentType: "application/json" }),
  );
}

async function arrived(page: Page, motion: "reduce" | "no-preference" = "reduce", size = COMPUTER) {
  await served(page);
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto(HOME);
  await hydrated(page);
  await running(page);
  await expect(railLinks(page).first()).toBeVisible(SLOW);
}

const rail = (page: Page) => page.locator("nav[aria-label='Worlds']:not([data-rail])");
const railLinks = (page: Page) => rail(page).locator("li a");
const names = (page: Page) => railLinks(page).allTextContents();
// Every label shown ends left of `x`, the rail's left edge.
async function clearOf(page: Page, x: number) {
  const rights = await page.$$eval("[data-labels] > *", (labels) =>
    labels
      .filter((label) => Number(getComputedStyle(label).opacity) > 0.05)
      .map((label) => label.getBoundingClientRect().right),
  );
  for (const right of rights) expect(right).toBeLessThanOrEqual(x);
}
// The fades the column's mask holds: the top's alone, or the foot's too while the column holds more than it shows.
const fadesOf = (page: Page) =>
  rail(page)
    .locator("ul")
    .locator("..")
    .evaluate((column) => getComputedStyle(column).maskImage.match(/rgba\(0, 0, 0, 0\)|transparent/g)?.length ?? 0);
const boxOf = async (page: Page, selector: string) => {
  const found = await page.locator(selector).first().boundingBox();
  if (found === null) throw new Error(`${selector} has no box`);
  return found;
};

test("stands where frame 4's rail stands, as tall as its worlds, its planets the frame's size and 98 px apart", async ({
  page,
}) => {
  await arrived(page);
  const { x, y, width, height } = await boxOf(page, "nav[aria-label='Worlds']:not([data-rail])");
  expect(Math.abs(x - FRAME.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(x + width - FRAME.right)).toBeLessThanOrEqual(2);
  expect(Math.abs(y - FRAME.top)).toBeLessThanOrEqual(6);
  // Eight worlds: the panel ends a step under See all, above frame 4's foot, and nothing fades at it.
  const all = await rail(page).getByRole("link", { name: "See all" }).boundingBox();
  const under = y + height - (all?.y ?? 0) - (all?.height ?? 0);
  expect(under).toBeGreaterThan(0);
  expect(under).toBeLessThanOrEqual(40);
  expect(y + height).toBeLessThan(FRAME.bottom - 40);
  expect(await fadesOf(page)).toBe(1);
  const planets = await rail(page)
    .locator("li [data-kind]")
    .evaluateAll((images) =>
      images.slice(0, 3).map((image) => {
        const box = image.getBoundingClientRect();
        return { size: box.width, middle: box.y + box.height / 2 };
      }),
    );
  for (const { size } of planets) expect(Math.abs(size - FRAME.planet)).toBeLessThanOrEqual(1);
  const [first, second] = planets;
  expect(Math.abs((second?.middle ?? 0) - (first?.middle ?? 0) - FRAME.pitch)).toBeLessThanOrEqual(4);
});

test("lists the Earth, then the trends, people before callers, the rising world and the seeds, and See all after them", async ({
  page,
}) => {
  await arrived(page);
  await expect.poll(() => names(page), SOON).toEqual(ORDER);
  await expect(rail(page).getByRole("link", { name: "See all" })).toHaveText("See all");
  expect(await railLinks(page).count()).toBeLessThanOrEqual(25);
});

test("keeps the labels out of its band", async ({ page }) => {
  await arrived(page);
  const { x } = await boxOf(page, "nav[aria-label='Worlds']:not([data-rail])");
  await expect.poll(() => page.locator("[data-labels] > *").count(), SLOW).toBeGreaterThan(0);
  await clearOf(page, x);
});

test("is one stop in the tab order, the arrows moving among its worlds, then See all, which opens the list", async ({
  page,
}) => {
  await arrived(page);
  const links = railLinks(page);
  await links.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(links.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(links.first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(rail(page).getByRole("link", { name: "See all" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/list\/?$/, SLOW);
});

test("goes to a world's page", async ({ page }) => {
  await arrived(page);
  await railLinks(page).filter({ hasText: "GovDAO" }).click();
  await expect(page).toHaveURL(/\/w\/govdao\/?$/, SLOW);
});

test("grows the planet under the pointer like a dock, its neighbours less, and lets them back when it leaves", async ({
  page,
}) => {
  await arrived(page, "no-preference");
  const planets = rail(page).locator("li [data-kind]");
  const sizes = () => planets.evaluateAll((thumbs) => thumbs.map((thumb) => thumb.getBoundingClientRect().width));
  const target = await planets.nth(2).boundingBox();
  if (target === null) throw new Error("no planet");
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  await expect.poll(async () => (await sizes())[2] ?? 0, SLOW).toBeGreaterThan(FRAME.planet * 1.5);
  // Read once the planets stand still: one reading for all of them.
  let settled: number[] = [];
  await expect
    .poll(async () => {
      const [before, after] = [await sizes(), (await page.waitForTimeout(300), await sizes())];
      settled = after;
      return before.every((size, at) => size === after[at]);
    }, SLOW)
    .toBe(true);
  const [above = 0, under = 0, below = 0] = settled.slice(1, 4);
  expect(under).toBe(Math.max(...settled));
  expect(under).toBeLessThanOrEqual(FRAME.planet * MAGNIFIED + 1);
  for (const near of [above, below]) {
    expect(near).toBeGreaterThan(FRAME.planet);
    expect(near).toBeLessThan(under);
  }
  // The pointed planet stays under the pointer, and once all stand still the dock writes nothing more.
  const middle = await planets.nth(2).evaluate((thumb) => {
    const box = thumb.getBoundingClientRect();
    return box.y + box.height / 2;
  });
  expect(Math.abs(middle - (target.y + target.height / 2))).toBeLessThanOrEqual(3);
  const writes = await rail(page)
    .locator("ul")
    .evaluate(
      (list) =>
        new Promise<number>((done) => {
          let count = 0;
          const watch = new MutationObserver((records) => {
            count += records.length;
          });
          watch.observe(list, { attributes: true, attributeFilter: ["style"], subtree: true });
          setTimeout(() => {
            watch.disconnect();
            done(count);
          }, 1000);
        }),
    );
  expect(writes).toBe(0);
  await page.mouse.move(100, 500);
  await expect.poll(async () => Math.max(...(await sizes())), SLOW).toBeCloseTo(FRAME.planet, 0);
});

test("grows nothing under reduced motion", async ({ page }) => {
  await arrived(page, "reduce");
  const planets = rail(page).locator("li [data-kind]");
  const target = await planets.nth(2).boundingBox();
  if (target === null) throw new Error("no planet");
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  await page.waitForTimeout(500);
  expect((await planets.nth(2).boundingBox())?.width).toBeCloseTo(FRAME.planet, 0);
});

test("shows each world but a seed as its own planet's portrait, drawn by the scene", async ({ page }) => {
  await arrived(page);
  const sources = () =>
    rail(page)
      .locator("li img")
      .evaluateAll((images) => images.map((image) => image.getAttribute("src") ?? ""));
  await expect
    .poll(async () => (await sources()).slice(0, 6).every((src) => src.startsWith("data:image/jpeg")), SLOW)
    .toBe(true);
  const seeds = (await sources()).slice(6);
  expect(seeds.every((src) => src.startsWith("data:image/svg+xml"))).toBe(true);
  // A portrait holds a lit planet: a good share of its pixels are neither black nor one flat colour.
  const lit = await rail(page)
    .locator("li img")
    .nth(1)
    .evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const canvas = document.createElement("canvas");
      [canvas.width, canvas.height] = [image.naturalWidth, image.naturalHeight];
      const context = canvas.getContext("2d");
      if (context === null) return { lit: 0, colours: 0 };
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let lit = 0;
      const colours = new Set<number>();
      for (let at = 0; at < data.length; at += 4) {
        const [red = 0, green = 0, blue = 0] = data.slice(at, at + 3);
        if (red + green + blue > 60) lit += 1;
        colours.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
      }
      return { lit: lit / (data.length / 4), colours: colours.size };
    });
  expect(lit.lit).toBeGreaterThan(0.3);
  expect(lit.colours).toBeGreaterThan(20);
});

test("lets the page's plain list of worlds step aside where it stands", async ({ page }) => {
  await arrived(page);
  await expect(page.locator("nav[aria-label='Worlds'][data-rail]")).toBeHidden();
  await expect(page.locator("nav[aria-label='Worlds']:visible")).toHaveCount(1);
});

test("stands no rail on a phone, which keeps its plain list and asks none of the rail's code once space shows", async ({
  page,
}) => {
  const asked: string[] = [];
  page.on("request", (request) => asked.push(request.url()));
  await served(page);
  await page.setViewportSize(PHONE);
  await page.goto(HOME);
  await hydrated(page);
  await page.getByRole("button", { name: "View in space" }).click();
  await running(page);
  await expect.poll(() => asked.some((url) => url.endsWith("/api/presence")), SLOW).toBe(true);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("nav[aria-label='Worlds'][data-rail]")).toBeVisible();
  await expect(rail(page)).toHaveCount(0);
  expect(asked.filter((url) => /\/assets\/(?:Rail|portraits)-[\w-]+\.js$/.test(url))).toEqual([]);
});

test("holds 25 worlds at most in its fixed panel, which scrolls, its last world and See all reached by the keyboard", async ({
  page,
}) => {
  await served(page, { called: Object.fromEntries(RECORDED.worlds.slice(0, 40).map(({ id }, at) => [id, 50 - at])) });
  await page.setViewportSize(COMPUTER);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(HOME);
  await hydrated(page);
  await expect.poll(() => railLinks(page).count(), SLOW).toBe(25);
  const { y, height } = await boxOf(page, "nav[aria-label='Worlds']:not([data-rail])");
  expect(Math.abs(y - FRAME.top)).toBeLessThanOrEqual(6);
  expect(Math.abs(y + height - FRAME.bottom)).toBeLessThanOrEqual(2);
  // The column scrolls inside the panel, which keeps its edge, and fades at its foot.
  expect(await fadesOf(page)).toBe(2);
  const column = rail(page).locator("ul").locator("..");
  expect(await column.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await railLinks(page).first().focus();
  await page.keyboard.press("End");
  await expect(railLinks(page).last()).toBeFocused();
  await expect(railLinks(page).last()).toBeInViewport();
  await page.keyboard.press("Tab");
  await expect(rail(page).getByRole("link", { name: "See all" })).toBeInViewport();
  const ticker = await boxOf(page, "[data-ticker]");
  expect(y + height).toBeLessThanOrEqual(ticker.y);
});

for (const size of [
  { width: 1280, height: 720 },
  { width: 900, height: 800 },
])
  test(`stands at the right edge at ${String(size.width)} by ${String(size.height)}, inside the labels' band`, async ({
    page,
  }) => {
    await arrived(page, "reduce", size);
    const { x, width, y, height } = await boxOf(page, "nav[aria-label='Worlds']:not([data-rail])");
    expect(Math.abs(x + width - (size.width - (COMPUTER.width - FRAME.right)))).toBeLessThanOrEqual(2);
    expect(Math.abs(width - (FRAME.right - FRAME.left))).toBeLessThanOrEqual(2);
    expect(y + height).toBeLessThanOrEqual(size.height);
    await clearOf(page, x);
  });

test("passes axe where it stands", async ({ page }) => {
  await arrived(page);
  const { violations } = await new AxeBuilder({ page }).include("nav[aria-label='Worlds']:not([data-rail])").analyze();
  expect(violations).toEqual([]);
});

test("draws its panel, names and See all as frame 4's rail", async ({ page }) => {
  await arrived(page);
  await expect.poll(() => names(page), SOON).toEqual(ORDER);
  // The panel's glass shows the cosmos behind it, which never stands still: hidden, as labels.spec.ts does.
  await page.locator("canvas").evaluate((canvas) => {
    canvas.style.visibility = "hidden";
  });
  await expect(rail(page)).toHaveScreenshot("rail.png", {
    mask: [rail(page).locator("li img")],
    maxDiffPixelRatio: 0.01,
    ...SLOW,
  });
});
