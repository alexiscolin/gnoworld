import { expect, test, type Page } from "./fixtures.ts";

// The home's loader stands in its first HTML (SpaceLoader.tsx; only / and /net/onyx/ hold it): on a computer it must be seen at the first
// paint, before any script runs, so no engine shows the bare page or a black screen while the scripts load; a phone draws no loader and
// keeps its column held. Scripts off stand for the time they take.
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
