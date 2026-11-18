import { expect, test, type Page } from "./fixtures.ts";

// The home's loader stands in its first HTML (SpaceLoader.tsx; / and /net/onyx/), the fallback's in the host's fallback page (LoaderMarks.tsx):
// on a computer each is seen at the first paint, before any script runs (scripts off stand for the time they take), so no engine shows the
// bare page or a black screen while the scripts load; a phone draws no loader and keeps its column held.
test.use({ javaScriptEnabled: false });

const loader = (page: Page) => page.getByRole("status", { name: "Loading space" });
// Opacity multiplies down the tree: a loader under a held column is as hidden as the column.
const opacityOf = (box: Element): number => {
  let opacity = 1;
  for (let node: Element | null = box; node !== null; node = node.parentElement)
    opacity *= Number(getComputedStyle(node).opacity);
  return opacity;
};

test("a computer's loader is drawn at the first paint, over the header, before any script runs", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(loader(page)).toBeAttached();
  expect(await loader(page).evaluate(opacityOf)).toBe(1);
  // The column holds nothing (an animation of its own would restart the hold) and the loader is what the header's logo point hits.
  expect(await page.locator("main").evaluate((main) => getComputedStyle(main).animationName)).toBe("none");
  const hit = await page.evaluate(() => {
    const logo = document.querySelector("header a")?.getBoundingClientRect();
    const top =
      logo === undefined ? null : document.elementFromPoint(logo.x + logo.width / 2, logo.y + logo.height / 2);
    return top?.closest("[data-loader]") !== null && top !== null;
  });
  expect(hit).toBe(true);
});

test("a phone keeps its column held: the loader it never shows does not lift the hold", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.locator("main").evaluate((main) => getComputedStyle(main).opacity)).toBe("0");
  expect(await page.locator("header").evaluate((header) => getComputedStyle(header).opacity)).toBe("0");
});

// The fallback's page (no HTML of its own, `/universe` and `/s/<ns>` among them) draws the loader's logo and bar from its first paint, where
// the home's loader then stands: never a black screen while its scripts and the worlds' file come.
for (const path of ["/universe", "/s/gnoland"])
  test(`${path}: the fallback draws the loader at the first paint, its logo where the header's stands, before any script runs`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await expect(loader(page)).toBeVisible();
    expect(await loader(page).evaluate(opacityOf)).toBe(1);
    // The logo's mark, drawn where the header's stands (the header held out of sight under it).
    const [logo, header] = await Promise.all([
      loader(page).locator("svg").boundingBox(),
      page.locator("header a svg").first().boundingBox(),
    ]);
    expect(logo, "the loader's logo").not.toBeNull();
    expect(logo, "the logo where the header's stands").toEqual(header);
  });

// The code may never come: the fallback's loader then gives way after 6 s, as the header's hold does (shellHeader.module.css), its links usable.
test("with no script, the fallback's loader gives way after 6 s and the header shows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/universe");
  await expect(loader(page)).toBeVisible();
  await expect(loader(page)).toHaveCount(0, { timeout: 8000 });
  expect(await page.locator("header").evaluate(opacityOf)).toBe(1);
});

test("a page written ahead keeps its own first paint: no fallback's loader over it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ["/earth", "/w/bubble"]) {
    await page.goto(path);
    await expect(loader(page), path).toHaveCount(0);
  }
});

test("a phone's fallback draws no loader", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/universe");
  await expect(loader(page)).toHaveCount(0);
});
