import { expect, hydrated, test } from "./fixtures.ts";

// How the pages of slice 5's 5d look: the Earth, the list and a world's breadcrumb, on a phone and on a computer. Each page
// is the same every run (the header's account is masked; a world's chat is left out).
const WIDTHS = [390, 1280] as const;
const PAGES: [name: string, path: string][] = [
  ["earth", "/earth"],
  ["list", "/list"],
  ["gnoland-earth", "/net/gnoland/earth"],
  ["world-trail", "/w/bubble"],
];

for (const width of WIDTHS) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 844 } });
    for (const [name, path] of PAGES) {
      test(`${path} looks as approved`, async ({ page }) => {
        await page.goto(path);
        await hydrated(page);
        const trail = page.getByRole("navigation", { name: "You are here" });
        await expect(trail).toBeVisible();
        // A world's page holds its chat, which loads after the page: its breadcrumb alone is drawn.
        const shown = path.startsWith("/w/") ? trail : page;
        await expect(shown).toHaveScreenshot(`${name}-${String(width)}.png`, { mask: [page.getByRole("banner")] });
      });
    }
  });
}
