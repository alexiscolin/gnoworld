import { expect, hydrated, scriptsAsked, test, type Page } from "./fixtures.ts";
import { flightOf, goInPage, opened } from "./sceneStage.ts";

// A station's page (8l): its world stands where a planet's does, goes with the page, and the page loads none of a station's code (the
// engine draws none, D400); its crumb says "Station" and its project's site is a link out. On the gate's software GPU.
const SLOW = { timeout: 90_000 };
const STATION_VIEW = /\/assets\/stationView-[\w-]+\.js$/;

test.describe.configure({ timeout: 180_000 });
test.use({ viewport: { width: 1728, height: 1080 } });

// The world the engine stands at: what a page's place asks of it. A station is a world like another to the engine (D400: none drawn round
// the Earth for now), so its page is read as the place the camera goes to.
const placed = async (page: Page) => {
  const { kind, id } = await flightOf(page);
  return kind === "world" ? id : undefined;
};

async function visit(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  await hydrated(page);
}

test("stands Adena's station page in the planet's circle, as a world's, and goes with the page", async ({ page }) => {
  const scripts = scriptsAsked(page);
  await visit(page, "/w/bubble?test-gpu");
  await expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
  await expect.poll(() => placed(page), SLOW).toBe("bubble");
  await goInPage(page, "/w/adena?test-gpu");
  await expect(page.locator("h1")).toHaveText("Adena");
  await expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
  await opened(page);
  await expect.poll(() => placed(page), SLOW).toBe("adena");
  // Back to a planet, then to another station, then off the world pages: the engine goes with the page.
  await goInPage(page, "/w/govdao?test-gpu");
  await expect(page.locator("h1")).toHaveText("GovDAO");
  await expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
  await expect.poll(() => placed(page), SLOW).toBe("gov/dao");
  await goInPage(page, "/w/gnoswap?test-gpu");
  await expect.poll(() => placed(page), SLOW).toBe("gnoswap");
  await expect(page.locator("[data-world='drawn']")).toBeAttached(SLOW);
  await goInPage(page, "/list");
  await expect.poll(() => placed(page), SLOW).toBeUndefined();
  expect(
    scripts.filter((url) => STATION_VIEW.test(url)),
    "no station code: the engine draws none (D400)",
  ).toEqual([]);
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
