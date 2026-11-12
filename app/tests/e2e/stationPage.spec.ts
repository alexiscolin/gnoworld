import { expect, hydrated, scriptsAsked, test, type Page } from "./fixtures.ts";
import { opened, stats } from "./sceneStage.ts";

// A station's page (8l): the station its name builds stands in the planet's place, says its state as a world's does, goes with the page, and
// a planet's page loads none of its code; its crumb says "Station" and its project's site is a link out. On the gate's software GPU.
const SLOW = { timeout: 90_000 };
const STATION_VIEW = /\/assets\/stationView-[\w-]+\.js$/;

test.describe.configure({ timeout: 180_000 });
test.use({ viewport: { width: 1728, height: 1080 } });

interface StationStats {
  name: string | undefined;
  parts: number;
}
const station = async (page: Page) =>
  ((await stats(page)) as unknown as { world: { station: StationStats | undefined } | undefined }).world?.station;

// The router's own move, as a link on the page would make it: no load, the scene kept.
const goInPage = (page: Page, path: string) =>
  page.evaluate((to) => {
    history.pushState(null, "", to);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);

async function visit(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  await hydrated(page);
}

test("stands Adena's station in the planet's circle, its code asked on its page alone, and takes it away on leaving", async ({
  page,
}) => {
  const scripts = scriptsAsked(page);
  await visit(page, "/w/bubble?test-gpu");
  await expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
  expect(
    scripts.filter((url) => STATION_VIEW.test(url)),
    "a planet's page asks none of the station's code",
  ).toEqual([]);
  await goInPage(page, "/w/adena?test-gpu");
  await expect(page.locator("h1")).toHaveText("Adena");
  await expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
  await opened(page);
  await expect.poll(async () => (await station(page))?.name, SLOW).toBe("Adena");
  expect((await station(page))?.parts ?? 0).toBeGreaterThan(0);
  expect(scripts.filter((url) => STATION_VIEW.test(url))).toHaveLength(1);
  // Back to a planet, then to another station: one stands at a time, and the chunk is asked once.
  await goInPage(page, "/w/govdao?test-gpu");
  await expect(page.locator("h1")).toHaveText("GovDAO");
  await expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
  await expect.poll(async () => (await station(page))?.name, SLOW).toBeUndefined();
  await goInPage(page, "/w/gnoswap?test-gpu");
  await expect.poll(async () => (await station(page))?.name, SLOW).toBe("GnoSwap");
  await expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
  expect(scripts.filter((url) => STATION_VIEW.test(url))).toHaveLength(1);
  await goInPage(page, "/list");
  await expect.poll(async () => (await station(page))?.name, SLOW).toBeUndefined();
});

test.describe("a station's code that does not come", () => {
  // The worker would answer the chunk from its cache, where no route of the page reaches.
  test.use({ serviceWorkers: "block" });

  test("says the station failed, and stands it on the next visit", async ({ page }) => {
    let refuse = true;
    await page.route(STATION_VIEW, (route) => (refuse ? route.abort() : route.continue()));
    await visit(page, "/w/gnoscan?test-gpu");
    // A body that failed leaves the page's box "none" (globe.ts's markGlobe): the plate opens with no hole.
    await expect(page.locator("[data-world='none']")).toBeAttached(SLOW);
    expect((await station(page))?.name).toBeUndefined();
    await expect(page.locator("h1")).toHaveText("Gnoscan");
    refuse = false;
    await goInPage(page, "/w/bubble?test-gpu");
    await expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
    await goInPage(page, "/w/gnoswap?test-gpu");
    await expect.poll(async () => (await station(page))?.name, SLOW).toBe("GnoSwap");
    await expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
  });
});

test("kicks the page as a station, links its project's site out in a tab of its own, and stamps the passport", async ({
  page,
}) => {
  await visit(page, "/w/adena");
  await expect(page.locator("[data-look='plate'] [data-planet]")).toHaveText("Station");
  await expect(page.locator("[data-look='plate'] nav")).toHaveCount(0);
  const site = page.getByRole("link", { name: /website/i });
  await expect(site).toHaveAttribute("href", /^https:\/\//);
  await expect(site).toHaveAttribute("target", "_blank");
  await expect(site).toHaveAttribute("rel", /noopener/);
  await expect(page.getByRole("status").getByText("Stamped · Adena")).toBeVisible(SLOW);
  // A planet's page has no project of its own to link out to.
  await page.goto("/w/govdao");
  await hydrated(page);
  await expect(page.getByRole("link", { name: /website/i })).toHaveCount(0);
});
