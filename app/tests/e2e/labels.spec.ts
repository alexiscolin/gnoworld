import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { running, stats } from "./sceneStage.ts";

// The cosmos's labels (frame 4; ADR-0002 §1; slice 7 §3): eight at most beside their bodies as f0004's (stem about 12 px in, 20 to 29 px
// off the outline), clear of each other, the Earth and the page; smaller or fainter far; counts only from data; text, never an address;
// the same eight elements however the eye moves.
const HOME = "/?test-gpu";
const COMPUTER = { width: 1728, height: 1080 };
const WIDE = { width: 1920, height: 1080 };
const LAPTOP = { width: 1280, height: 800 };
const RECORDED = readFileSync(new URL("../../lab/worlds.json", import.meta.url), "utf8");
const ADDRESS = /g1[023456789acdefghjklmnpqrstuvwxyz]{38}/;
const SLOW = { timeout: 90_000 };
// Frame 4's gaps between a label and its body's outline, 20 to 29 px, and a few pixels either way for the outline's soft edge.
const GAP = { least: 16, most: 33 };
const GNOSLINGER = "g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger";

test.describe.configure({ timeout: 180_000 });

interface Seen {
  title: string;
  count: string;
  badge: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}
interface Placed {
  id: string;
  kind: string;
  title: string;
  shown: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  fade: number;
  stem: number;
  below: boolean;
  away: number;
  anchor: { x: number; y: number; radius: number };
}

const served = (page: Page, body = RECORDED) =>
  page.route("**/worlds.json", (route) => route.fulfill({ body, contentType: "application/json" }));
const presence = (page: Page, worlds: unknown[]) =>
  page.route("**/api/presence", (route) =>
    route.fulfill({ body: JSON.stringify({ worlds }), contentType: "application/json" }),
  );

async function arrived(page: Page, size = COMPUTER, motion: "reduce" | "no-preference" = "reduce") {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto(HOME);
  await hydrated(page);
  await running(page);
}

const onPage = (page: Page) =>
  page.$$eval("[data-labels] > *", (elements) =>
    elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      const [title, count, badge] = [...element.children].map((part) => part.textContent);
      return {
        title: title ?? "",
        count: count ?? "",
        badge: badge ?? "",
        x,
        y,
        width,
        height,
        opacity: Number(getComputedStyle(element).opacity),
      };
    }),
  );
const shownOnPage = async (page: Page): Promise<Seen[]> => (await onPage(page)).filter(({ opacity }) => opacity > 0.05);
const placed = async (page: Page): Promise<Placed[]> =>
  ((await stats(page)).cosmos as unknown as { labels?: Placed[] } | undefined)?.labels ?? [];
// The labels a view at rest shows, once they stand: the bodies', and the Earth's once its globe has come.
async function settled(page: Page, least = 4) {
  await expect.poll(async () => (await shownOnPage(page)).length, SLOW).toBeGreaterThanOrEqual(least);
  await expect.poll(async () => (await shownOnPage(page)).map(({ title }) => title), SLOW).toContain("Earth");
  return shownOnPage(page);
}
const apart = (a: Seen, b: Seen) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
const offCircle = ({ x, y, width, height }: Seen, circle: { x: number; y: number; radius: number }) =>
  Math.hypot(Math.max(x - circle.x, 0, circle.x - x - width), Math.max(y - circle.y, 0, circle.y - y - height)) >=
  circle.radius;
const boxesOf = (page: Page, selector: string) =>
  page.$$eval(selector, (elements) =>
    elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { title: "", count: "", badge: "", x, y, width, height, opacity: 1 };
    }),
  );

for (const size of [COMPUTER, WIDE])
  test(`names what the view at rest draws at ${String(size.width)} px: eight at most, the Earth first, never an address`, async ({
    page,
  }) => {
    await served(page);
    await presence(page, []);
    await arrived(page, size);
    const shown = await settled(page);
    expect(shown.length).toBeLessThanOrEqual(8);
    expect(await page.locator("[data-labels] > *").count()).toBe(8);
    expect((await page.locator("[data-labels]").textContent()) ?? "").not.toMatch(ADDRESS);
    const titles = shown.map(({ title }) => title);
    expect(titles).toContain("Earth");
    const { cosmos } = await stats(page);
    const bodies = cosmos?.screen.bodies ?? [];
    const named = (await placed(page)).filter(({ shown: on, kind }) => on && kind === "near").map(({ id }) => id);
    expect(bodies.length).toBeGreaterThan(0);
    expect(
      bodies.filter(({ id }) => !named.includes(id)),
      "a body the view draws has no label",
    ).toEqual([]);
    expect(
      shown.every(({ count, badge }) => count === "" && badge === ""),
      "no count nor badge without data",
    ).toBe(true);
  });

test("keeps every label clear of the others, the Earth, the hero, the header and the ticker", async ({ page }) => {
  await served(page);
  await presence(page, [{ world: "earth", here: 184, perHour: 130.4, rise: 0.214 }]);
  await arrived(page);
  const shown = await settled(page);
  for (const [at, one] of shown.entries())
    for (const other of shown.slice(at + 1)) expect(apart(one, other), `${one.title} over ${other.title}`).toBe(true);
  const keep = [
    ...(await boxesOf(page, "[data-clear]")),
    ...(await boxesOf(page, "header a, header button")),
    ...(await boxesOf(page, "[data-ticker]")),
  ];
  expect(keep.length).toBeGreaterThan(2);
  for (const one of shown) for (const box of keep) expect(apart(one, box), `${one.title} over the page`).toBe(true);
  const earth = (await stats(page)).cosmos?.screen.earth;
  expect(earth).toBeDefined();
  for (const one of shown)
    expect(offCircle(one, earth ?? { x: 0, y: 0, radius: 0 }), `${one.title} over the Earth`).toBe(true);
});

test("stands each label beside its body as frame 4's do, as the page draws it", async ({ page }) => {
  await served(page);
  await presence(page, []);
  await arrived(page);
  await settled(page);
  const seen = await shownOnPage(page);
  const near = (await placed(page)).filter(({ shown, kind }) => shown && kind !== "far");
  expect(near.length).toBeGreaterThanOrEqual(4);
  for (const label of near) {
    const drawn = seen.find(({ title }) => title === label.title);
    expect(drawn, `${label.title} on the page`).toBeDefined();
    expect(Math.abs((drawn?.x ?? NaN) - label.left)).toBeLessThanOrEqual(1);
    expect(Math.abs((drawn?.y ?? NaN) - label.top)).toBeLessThanOrEqual(1);
    const stemAt = label.left + label.stem * label.scale;
    const { x, y, radius } = label.anchor;
    expect(Math.abs(stemAt - x), `${label.title}'s stem over its body`).toBeLessThanOrEqual(radius);
    const outline = Math.sqrt(Math.max(radius ** 2 - (stemAt - x) ** 2, 0));
    const gap = label.below ? label.top - (y + outline) : y - outline - (label.top + label.height * label.scale);
    expect(gap, `${label.title}'s gap to its body`).toBeGreaterThanOrEqual(GAP.least);
    expect(gap, `${label.title}'s gap to its body`).toBeLessThanOrEqual(GAP.most);
  }
});

test("draws a farther world's label no larger and no brighter than a nearer one's", async ({ page }) => {
  await served(page);
  await presence(page, []);
  await arrived(page);
  await settled(page);
  const byDistance = (await placed(page)).filter(({ shown }) => shown).sort((a, b) => a.away - b.away);
  expect(byDistance.length).toBeGreaterThanOrEqual(4);
  const scales = byDistance.map(({ scale }) => scale);
  const fades = byDistance.map(({ fade }) => fade);
  expect(scales).toEqual([...scales].sort((a, b) => b - a));
  expect(fades).toEqual([...fades].sort((a, b) => b - a));
  expect(Math.min(...scales) < Math.max(...scales) || Math.min(...fades) < Math.max(...fades)).toBe(true);
  // The design system's floor: no word under 11 px, a far label's name at its smallest included.
  const sizes = await page.$$eval("[data-labels] > *", (elements) =>
    elements.map((element) => Number.parseFloat(getComputedStyle(element.children[0] ?? element).fontSize)),
  );
  const least = Math.min(...byDistance.map(({ scale }) => scale));
  expect(Math.min(...sizes) * least).toBeGreaterThanOrEqual(11);
});

test("lets every click through to the cosmos: its labels take no pointer", async ({ page }) => {
  await served(page);
  await presence(page, []);
  await arrived(page);
  await settled(page);
  const pointers = await page.$$eval("[data-labels] > *", (labels) =>
    labels.map((label) => getComputedStyle(label).pointerEvents),
  );
  expect(pointers).toEqual(Array.from({ length: 8 }, () => "none"));
});

test("stands its labels with motion on too, once the arrival's glide ends", async ({ page }) => {
  await served(page);
  await presence(page, []);
  await arrived(page, COMPUTER, "no-preference");
  await settled(page);
  const shown = await shownOnPage(page);
  for (const [at, one] of shown.entries())
    for (const other of shown.slice(at + 1)) expect(apart(one, other)).toBe(true);
});

test("asks no labels' code on a phone before View in space, nor on another universe's cosmos", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (/\/assets\/labelled-[\w-]+\.js$/.test(request.url())) asked.push(request.url());
  });
  await served(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?test-gpu");
  await hydrated(page);
  await expect(page.getByRole("button", { name: "View in space" })).toBeVisible();
  await page.goto("/net/gnoland/?test-gpu");
  await hydrated(page);
  await page.waitForTimeout(1500);
  expect(asked).toEqual([]);
  expect((await shownOnPage(page)).length).toBe(0);
  // And the same watch sees the code come where the cosmos shows: the test can fail.
  await page.setViewportSize(COMPUTER);
  await page.goto(HOME);
  await hydrated(page);
  await expect.poll(() => asked.length, SLOW).toBeGreaterThan(0);
});

test("gives the Earth's label its people and its heat from the server's count, and looks as approved", async ({
  page,
}) => {
  await served(page);
  await presence(page, [{ world: "earth", here: 184, perHour: 130.4, rise: 0.214 }]);
  await arrived(page);
  await settled(page);
  await expect
    .poll(async () => (await shownOnPage(page)).find(({ title }) => title === "Earth")?.count, SLOW)
    .toBe("184 here");
  const earth = (await shownOnPage(page)).find(({ title }) => title === "Earth");
  expect(earth?.badge).toBe("▲ 21% · 130/h");
  await page.locator("canvas").evaluate((canvas) => {
    canvas.style.visibility = "hidden";
  });
  await expect(page.locator("[data-labels] > *").filter({ hasText: "Earth" })).toHaveScreenshot("label-earth.png");
});

test("calls an unvisited new world an uncharted signal, never by its path, and looks as approved", async ({ page }) => {
  const file = JSON.parse(RECORDED) as { worlds: { id: string; seen?: string }[] };
  const fresh = file.worlds.find(({ id }) => id === GNOSLINGER);
  if (fresh === undefined) throw new Error("the recorded file lost its postcard");
  fresh.seen = new Date(Date.now() - 86_400_000).toISOString();
  await served(page, JSON.stringify(file));
  await presence(page, []);
  await arrived(page);
  await settled(page);
  await expect
    .poll(async () => (await shownOnPage(page)).map(({ title }) => title), SLOW)
    .toContain("Uncharted signal");
  const signal = (await shownOnPage(page)).find(({ title }) => title === "Uncharted signal");
  expect(signal?.count).toBe("go and look");
  expect((await shownOnPage(page)).map(({ title }) => title)).not.toContain("gnoslinger");
  await page.locator("canvas").evaluate((canvas) => {
    canvas.style.visibility = "hidden";
  });
  await expect(page.locator("[data-labels] > *").filter({ hasText: "Uncharted signal" })).toHaveScreenshot(
    "label-uncharted.png",
  );
});

test("keeps the same eight labels as the eye leaves the view at rest and comes back", async ({ page }) => {
  await served(page);
  await presence(page, []);
  await arrived(page);
  await settled(page);
  const rest = (await stats(page)).eye;
  await page.evaluate(() => {
    Reflect.set(globalThis, "__labels", [...document.querySelectorAll("[data-labels] > *")]);
  });
  const moveTo = (to: { x: number; y: number; z: number }) =>
    page.evaluate((at) => {
      (Reflect.get(globalThis, "__gnoworldScene") as { moveTo: (where: typeof at) => void }).moveTo(at);
    }, to);
  await moveTo({ x: rest.x + 40, y: rest.y + 10, z: rest.z - 60 });
  await expect.poll(async () => (await stats(page)).cosmos?.looks ?? 0, SLOW).toBeGreaterThan(1);
  expect((await shownOnPage(page)).length).toBeLessThanOrEqual(8);
  await moveTo(rest);
  await settled(page);
  const same = await page.evaluate(() => {
    const kept = Reflect.get(globalThis, "__labels") as Element[];
    const now = [...document.querySelectorAll("[data-labels] > *")];
    return now.length === 8 && now.every((element, at) => element === kept[at]);
  });
  expect(same).toBe(true);
});

test("shows no label where the cosmos is covered: the Earth's page and a world's keep their plate clear", async ({
  page,
}) => {
  await served(page);
  await presence(page, []);
  await arrived(page);
  await settled(page);
  await page.getByRole("link", { name: "Earth", exact: true }).first().click();
  await expect.poll(async () => (await shownOnPage(page)).length, SLOW).toBe(0);
  await page.goto("/w/govdao?test-gpu");
  await hydrated(page);
  await running(page);
  expect((await shownOnPage(page)).length).toBe(0);
});

test("leaves the home's axe check clean with its labels standing, at 1280 px", async ({ page }) => {
  await served(page);
  await presence(page, []);
  await arrived(page, LAPTOP);
  await settled(page, 2);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
