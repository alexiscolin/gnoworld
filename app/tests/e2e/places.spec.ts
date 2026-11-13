import { placesFrom } from "../../src/dataPlaces.ts";
import ecosystems from "../../data/ecosystems.json" with { type: "json" };
import hubs from "../../data/hubs.json" with { type: "json" };
import universes from "../../data/universes.json" with { type: "json" };
import { violations } from "./axe.ts";
import { expect, hydrated, test } from "./fixtures.ts";

// Slice 5's 5d: every place of the data has its page, at its path and at its canonical address.
const places = placesFrom({ universes, hubs, ecosystems });
const widths = [390, 1280];

test.describe("every place of the data files", () => {
  test.use({ javaScriptEnabled: false });

  test("the data holds places to walk: the cosmos, an Earth a universe, a world", () => {
    expect(places.filter((p) => p.kind === "earth")).toHaveLength(universes.length);
    expect(places.some((p) => p.kind === "world")).toBe(true);
  });

  for (const place of places) {
    for (const path of new Set([place.path, place.canonical])) {
      test(`${path} is a page, pre-rendered, with one heading and its canonical address`, async ({ page }) => {
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          "href",
          `https://gno.world${place.canonical}`,
        );
      });
    }
  }
});

test.describe("the pages added in 5d", () => {
  // The header's levels say where the place is; the plate carries no crumb.
  test("/earth is the Earth, its heading and a way to the worlds", async ({ page }) => {
    await page.goto("/earth");
    await expect(page.getByRole("heading", { level: 1, name: "Earth" })).toBeVisible();
    await expect(page.locator("header nav[aria-label='Views']").getByRole("link", { name: /Galaxy/ })).toBeVisible();
  });

  test("a universe with no world draws its Earth and says nothing of worlds", async ({ page }) => {
    await page.goto("/net/gnoland/earth");
    await expect(page.getByRole("heading", { level: 1, name: "Earth" })).toBeVisible();
    await expect(page.getByText(/no world yet/i)).toHaveCount(0);
  });

  test("a world's page says its genre and kind over its title, in the header's levels, and in no crumb", async ({
    page,
  }) => {
    await page.goto("/w/bubble");
    const plate = page.locator("[data-look='plate']");
    await expect(plate.getByText("Games · dApp")).toBeVisible();
    await expect(plate.locator("nav[aria-label='You are here']")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: /breadcrumb/i })).toHaveCount(0);
    await expect(
      page.locator("header nav[aria-label='Views']").getByRole("link", { name: "Bubble", exact: true }),
    ).toBeVisible();
  });

  test("a link from the Earth to a world changes the page without a reload", async ({ page }) => {
    // The full chat's worlds list is the Earth's way to a world (8g); beside the dock it is hidden.
    await page.goto("/earth?chat=full");
    await hydrated(page);
    await page.evaluate(() => {
      Object.assign(window, { stayed: true });
    });
    await page.getByRole("link", { name: "Bubble" }).click();
    await expect(page).toHaveURL(/\/w\/bubble/);
    expect(await page.evaluate(() => "stayed" in window)).toBe(true);
  });

  test("/list goes to the home with the search palette open, Discover on its empty field (D355, D373)", async ({
    page,
  }) => {
    await page.goto("/list");
    await hydrated(page);
    await expect(page).toHaveURL(/\/#search$/);
    await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
    // Its empty field is Discover (D373): the places are found by their name.
    await page.getByRole("combobox", { name: "Search places" }).fill("bubb");
    await page.getByRole("option", { name: /Bubble/ }).click();
    await expect(page).toHaveURL("/w/bubble");
  });

  // F376: the path's case is part of the address.
  for (const path of ["/W/bubble", "/W/Bubble", "/Earth", "/LIST", "/net/onyx/W/bubble", "/E/tokens"]) {
    test(`${path} is refused with a 404, in the host and in the browser`, async ({ page, request }) => {
      expect((await request.get(path)).status(), path).toBe(404);
      await page.goto("/");
      await hydrated(page);
      await page.evaluate((to) => {
        history.pushState({}, "", to);
        dispatchEvent(new PopStateEvent("popstate"));
      }, path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/No (world|page|universe|ecosystem) here/);
    });
  }

  // F376's own path: a link shared in another case is a direct load, the host's 404 page then hydrated by the client. The
  // refused page is not indexed and names no address: its harm was a world page a search engine would index.
  for (const path of ["/W/bubble", "/w/Bubble", "/net/Onyx/w/bubble", "/Earth"]) {
    test(`a direct visit to ${path} shows not found, not indexed, with no canonical address`, async ({ page }) => {
      await page.goto(path);
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^No (world|page|universe) here$/);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    });
  }

  test("a path with a query or a fragment is the page, not a refused one", async ({ page }) => {
    await page.goto("/w/bubble?utm=1#top");
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: "Bubble" })).toBeVisible();
  });

  test("an ecosystem the data does not hold is not found", async ({ request }) => {
    expect((await request.get("/e/tokens")).status()).toBe(404);
  });
});

for (const width of widths) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 844 } });
    for (const path of ["/earth", "/list", "/net/onyx/", "/net/onyx/earth", "/net/gnoland/earth", "/w/bubble"]) {
      test(`${path} has no accessibility violation (axe) and no box past the width`, async ({ page }) => {
        await page.goto(path);
        await hydrated(page);
        await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
          /^No (page|world|universe|ecosystem) here$/,
        );
        expect(await violations(page)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      });
    }
  });
}
