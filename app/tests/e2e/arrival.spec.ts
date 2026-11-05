import AxeBuilder from "@axe-core/playwright";
import { adena } from "./adena.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

// Slice 9h (frames 90 to 97): the arrival banners against the real server. A world is charted once a run, so this file owns
// the first chart of /w/govdao (D210): no other journey opens it logged in. Serial; it waits on the page's own events.
test.describe.configure({ mode: "serial" });

const violations = async (page: Page) => (await new AxeBuilder({ page }).analyze()).violations;
const chartBanner = (page: Page) => page.getByText("First to chart · GovDAO");
const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
// An event of the page's own to wait on before a count of 0 is read: toHaveCount(0) returns at once when nothing is there.
const answered = (page: Page, method: "GET" | "POST", url: string) =>
  page.waitForResponse((r) => r.url().endsWith(url) && r.request().method() === method);

// Logs in on a world as the wallet `as`, and gives the server's answer to the chart call the page made.
async function arriveAs(page: Page, as: string, path = "/w/govdao"): Promise<unknown> {
  await adena(page, "signs", as);
  await page.goto(path);
  await hydrated(page);
  const call = answered(page, "POST", "/api/signals/chart");
  await page.getByRole("button", { name: "Log in with Adena" }).click();
  const answer: unknown = await (await call).json();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  return answer;
}

test("a guest sees no banner and a plate that names nobody before anyone has charted", async ({ page }) => {
  const read = answered(page, "GET", "/api/signals?world=govdao");
  await page.goto("/w/govdao");
  await hydrated(page);
  expect(await (await read).json()).toEqual({ world: "govdao", charted: null, words: null });
  await expect(chartBanner(page)).toHaveCount(0);
  await expect(page.getByText(/^First charted by/)).toHaveCount(0);
});

test("the first logged-in account to open a world gets the banner from the server's signal, at 390 and 1280 px, with no axe violation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await arriveAs(page, "first-charter")).toEqual({ world: "govdao", first: true });
  await expect(chartBanner(page)).toBeVisible();
  await expect(page.getByText(/^First charted by @g1/)).toBeVisible();
  expect(await violations(page)).toEqual([]);
  expect(await sideways(page)).toBe(0);
  await page.setViewportSize({ width: 1280, height: 1080 });
  await expect(chartBanner(page)).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

// The server's own answer comes first, then the page's: a banner shown from a late answer would be missed by a count read too soon.
test("a later account sees who charted it, and no banner", async ({ page }) => {
  expect(await arriveAs(page, "second-charter")).toEqual({ world: "govdao", first: false });
  await expect(page.getByText(/^First charted by @g1/)).toBeVisible();
  await expect(chartBanner(page)).toHaveCount(0);
});

// D210 gives every world a first chart, so Earth and Bubble, which the other journeys open, are charted when the server starts
// (api.mjs): no journey's plate gets a banner by the order the workers run in.
test("the worlds the other journeys open are charted already: no banner, whoever logs in first", async ({ page }) => {
  expect(await arriveAs(page, "third-charter", "/w/bubble")).toEqual({ world: "bubble", first: false });
  await expect(page.getByText(/^First to chart/)).toHaveCount(0);
});

test("a guest's page, reloaded, shows the plate's first and still no banner", async ({ page }) => {
  const read = answered(page, "GET", "/api/signals?world=govdao");
  await page.goto("/w/govdao");
  await hydrated(page);
  await read;
  await expect(page.getByText(/^First charted by @g1/)).toBeVisible();
  await expect(chartBanner(page)).toHaveCount(0);
});
