import { expect, hydrated, test } from "./fixtures.ts";

// How slice 5's 5n palette looks, on a phone and on a computer: with its results, and with none. The dialog alone is drawn.
const WIDTHS = [390, 1280] as const;

for (const width of WIDTHS) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 844 }, figures: true });
    for (const [name, query] of [
      ["results", ""],
      ["no-place", "zzz"],
    ] as const) {
      test(`the palette with ${name} looks as approved`, async ({ page }) => {
        await page.goto("/earth");
        await hydrated(page);
        await page.getByRole("button", { name: /^Search/ }).click();
        const palette = page.getByRole("dialog", { name: "Search" });
        await expect(palette).toBeVisible();
        await page.getByRole("combobox", { name: "Search places" }).fill(query);
        await expect(
          (query === "" ? palette.getByRole("option") : palette.getByText(/no place/i)).first(),
        ).toBeVisible();
        await expect(palette).toHaveScreenshot(`palette-${name}-${String(width)}.png`);
      });
    }
  });
}
