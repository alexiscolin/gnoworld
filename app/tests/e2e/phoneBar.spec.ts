import { lineOf, lines } from "./chat.ts";
import { expect, test } from "./fixtures.ts";
import { asAccount, barOf, crossedByBar, ROOM } from "./talk.ts";

// F1170's U1 (the UX review): on a phone a line's column is about 168 px wide; the bar's five controls wrapped to two
// rows over the line's own words. Narrow, the bar stands in the flow under the line, on one row, its three quick
// reactions behind one React menu (docs/decisions.md, 2026-10-27).
test.describe("a line's bar on a phone's screen", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("stands on one row under the line, never over a word of the list", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await asAccount(page);
    await lines(page).nth(1).focus();
    const bar = barOf(page, 1);
    await expect(bar.getByRole("button")).toHaveCount(3);
    await expect(bar.getByRole("button", { name: "React", exact: true })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Reply" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "More" })).toBeVisible();
    const centres = await bar.getByRole("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return box.top + box.height / 2;
      }),
    );
    expect(Math.max(...centres) - Math.min(...centres)).toBeLessThan(5);
    const crossed = await crossedByBar(page);
    expect(crossed).toEqual([]);
  });

  test("reacts through the React menu, and takes the reaction back from it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { said } = await asAccount(page);
    await lines(page).nth(1).focus();
    const react = barOf(page, 1).getByRole("button", { name: "React", exact: true });
    await react.click();
    await page.getByRole("menuitem", { name: "React with 👍" }).click();
    await expect(lineOf(page, "the second").getByRole("button", { name: "👍, 1, including you" })).toBeVisible();
    await lines(page).nth(1).focus();
    await react.click();
    await page.getByRole("menuitem", { name: "Take back 👍" }).click();
    await expect(lineOf(page, "the second").getByRole("button", { name: /👍/ })).toHaveCount(0);
    expect(said().map((line) => line.replace(/^@label=[^;]+;/, ""))).toEqual([
      `+draft/react=👍;+reply=m2 TAGMSG ${ROOM}`,
      `+draft/unreact=👍;+reply=m2 TAGMSG ${ROOM}`,
    ]);
  });
});
