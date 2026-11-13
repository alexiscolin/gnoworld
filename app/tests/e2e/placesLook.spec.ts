import { expect, hydrated, test } from "./fixtures.ts";
import { calmed } from "./figures.ts";
import { scriptedErgo } from "./scripted.ts";

// How the pages of slice 5's 5d look: the Earth and a world's plate, on a phone and on a computer. Each page
// is the same every run (the header's account is masked; a world's chat is left out; its figures are the fixture's, its people a
// scripted Ergo's, its arrival's pill closed).
const WIDTHS = [390, 1280] as const;
const PAGES: [name: string, path: string][] = [
  ["earth", "/earth"],
  ["gnoland-earth", "/net/gnoland/earth"],
  ["world-plate", "/w/bubble"],
];

for (const width of WIDTHS) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 844 }, figures: true, timezoneId: "UTC" });
    for (const [name, path] of PAGES) {
      test(`${path} looks as approved`, async ({ page }) => {
        if (path.startsWith("/w/"))
          await page.routeWebSocket(/\/ws$/, (ergo) => {
            scriptedErgo(ergo, "guest-zzzzzz");
          });
        await page.goto(path);
        await hydrated(page);
        // A world's page holds its chat, which loads after the page: its plate alone is drawn (frame 26: the kicker, the title,
        // the activity's words, the actions); the other pages are taken whole.
        const world = path.startsWith("/w/");
        if (world) await calmed(page);
        const shown = world ? page.locator("[data-look='plate']") : page;
        // On a phone the chat sits above the plate: its height, which follows the room's lines, shifts the plate by a part of a
        // pixel and Playwright rounds the plate's box out, so the picture was 355 or 356 px high by the room's state. The chat
        // is taken out of the page (set by the DOM, a style tag is refused by the CSP), and the plate lies at a whole pixel.
        if (world || path.endsWith("/earth"))
          await page.evaluate(() => document.getElementById("chat")?.style.setProperty("display", "none"));
        await expect(
          world ? page.locator("[data-look='plate']") : page.getByRole("heading", { level: 1, name: "Earth" }),
        ).toBeVisible();
        await expect(shown).toHaveScreenshot(`${name}-${String(width)}.png`, { mask: [page.getByRole("banner")] });
      });
    }
  });
}
