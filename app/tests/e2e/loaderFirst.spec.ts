import { expect, test } from "./fixtures.ts";

// The home's loader stands in the page's first HTML (SpaceLoader.tsx): it must be seen at the first paint, before any script runs, so
// no engine shows the bare page or a black screen while the scripts load. Scripts off stand for the time they take.
test.use({ javaScriptEnabled: false });

test("the loader is drawn at the first paint, before any script runs", async ({ page }) => {
  await page.goto("/");
  const loader = page.getByRole("status", { name: "Loading space" });
  await expect(loader).toBeAttached();
  // Opacity multiplies down the tree: a loader under a held column is as hidden as the column.
  const seen = await loader.evaluate((box) => {
    let opacity = 1;
    for (let node: Element | null = box; node !== null; node = node.parentElement)
      opacity *= Number(getComputedStyle(node).opacity);
    return opacity;
  });
  expect(seen).toBe(1);
});
