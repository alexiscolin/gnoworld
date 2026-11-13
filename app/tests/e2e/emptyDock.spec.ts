import { expect, hydrated, test, type Page } from "./fixtures.ts";

// A world's page opened by a click always has its chat in its dock: the one chat screen inside the page's own #chat, never an empty
// outline over the planet.
test.use({ viewport: { width: 1440, height: 900 } });

async function docked(page: Page, label: string) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const dock = document.querySelector("#chat");
          const seat = dock?.querySelector("[data-chat-seat]");
          const screens = document.querySelectorAll("#chat [data-chat-screen]").length;
          return `${dock === null ? "no dock" : "dock"} ${seat === null || seat === undefined ? "no seat" : "seat"} ${String(screens)} screens`;
        }),
      { message: `${label}: the dock holds the chat`, timeout: 20_000 },
    )
    .toBe("dock seat 1 screens");
}

// The search palette's way: "/" opens it, a place's name found, its row clicked.
async function viaSearch(page: Page, name: string) {
  await page.locator("body").press("/");
  await page.getByRole("combobox", { name: "Search places" }).fill(name.slice(0, 4));
  await page.getByRole("option", { name: new RegExp(name) }).click({ timeout: 15_000 });
}

const hop = (page: Page, to: string) =>
  page.evaluate((path) => {
    history.pushState({}, "", path);
    dispatchEvent(new PopStateEvent("popstate"));
  }, to);

test("the dock is never empty when a click opens a world's page (empty dock)", async ({ page }) => {
  test.setTimeout(240_000);
  const steps: string[] = [];
  try {
    await page.goto("/?test-gpu");
    await hydrated(page);
    for (let round = 0; round < 4; round++) {
      for (const [name, slug] of [
        ["Bubble", "bubble"],
        ["GovDAO", "govdao"],
      ] as const) {
        steps.push(`${name} by search, round ${String(round)}`);
        await viaSearch(page, name);
        await expect(page).toHaveURL(new RegExp(`/w/${slug}`));
        await docked(page, `${name} by search`);
        steps.push("back");
        await page.goBack({ timeout: 15_000 });
        await page.waitForTimeout(250 * round);
        steps.push("forward");
        await page.goForward({ timeout: 15_000 });
        await docked(page, `${name} forward`);
        steps.push("hop to the other");
        await hop(page, `/w/${slug === "bubble" ? "govdao" : "bubble"}`);
        await page.waitForTimeout(120 * round);
        await docked(page, "hop");
        steps.push("back to home");
        await page.goto("/?test-gpu");
        await hydrated(page);
      }
    }
  } catch (error) {
    throw new Error(`${steps.slice(-5).join(" > ")} :: ${String(error)}`, { cause: error });
  }
});

test("the dock holds the chat after quick hops between pages, whatever the delay (empty dock)", async ({ page }) => {
  test.setTimeout(280_000);
  const steps: string[] = [];
  const pages = ["/w/bubble", "/w/govdao", "/earth", "/", "/w/bubble", "/w/govdao"];
  let seed = 7;
  const next = (n: number) => {
    seed = (seed * 48271) % 2147483647;
    return seed % n;
  };
  try {
    await page.goto("/?test-gpu");
    await hydrated(page);
    for (let step = 0; step < 60; step++) {
      const to = pages[next(pages.length)] ?? "/";
      const wait = [0, 0, 40, 150, 400, 900][next(6)] ?? 0;
      steps.push(`${to} then ${String(wait)} ms`);
      if (next(4) === 0) await page.goBack({ timeout: 15_000 });
      else await hop(page, to);
      await page.waitForTimeout(wait);
      if (next(5) === 0) continue;
      const here = new URL(page.url()).pathname;
      if (here.startsWith("/w/")) await docked(page, `step ${String(step)} at ${here}`);
    }
  } catch (error) {
    throw new Error(`${steps.slice(-6).join(" > ")} :: ${String(error)}`, { cause: error });
  }
});
