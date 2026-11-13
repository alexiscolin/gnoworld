import { lineOf, lines } from "./chat.ts";
import { expect, test } from "./fixtures.ts";
import { asAccount, barOf, ROOM } from "./talk.ts";

// F1170's U1 (the UX review): on a phone a line's column is about 168 px wide; the bar's controls wrapped to two rows.
// Narrow, the bar floats over the line as it does wide, on one row, its three quick reactions behind one React menu, and
// no line moves as it comes (docs/decisions.md, D376).
test.describe("a line's bar on a phone's screen", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("floats on one row over the line, and moves no line", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await asAccount(page);
    const below = async () => (await lines(page).nth(1).boundingBox())?.y;
    const was = await below();
    await lines(page).nth(0).focus();
    const bar = barOf(page, 0);
    await expect(bar.getByRole("button")).toHaveCount(8);
    await expect(bar.getByRole("button", { name: "Add reaction", exact: true })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Reply" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "More" })).toBeVisible();
    const centres = await bar.getByRole("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return box.top + box.height / 2;
      }),
    );
    expect(Math.max(...centres) - Math.min(...centres)).toBeLessThan(5);
    expect(await below()).toBe(was);
  });

  test("reacts through the Add reaction menu, and takes the reaction back from it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { said } = await asAccount(page);
    await lines(page).nth(1).focus();
    const react = barOf(page, 1).getByRole("button", { name: "Add reaction", exact: true });
    await react.click();
    await page.getByRole("menuitem", { name: "React with 👍" }).click();
    await expect(lineOf(page, "the second").getByRole("button", { name: "👍, 1, including you" })).toBeVisible();
    await lines(page).nth(1).focus();
    await react.click();
    await page.getByRole("menuitem", { name: "Take back 👍" }).click();
    await expect(lineOf(page, "the second").getByRole("button", { name: /^👍,/ })).toHaveCount(0);
    expect(said().map((line) => line.replace(/^@label=[^;]+;/, ""))).toEqual([
      `+draft/react=👍;+reply=m2 TAGMSG ${ROOM}`,
      `+draft/unreact=👍;+reply=m2 TAGMSG ${ROOM}`,
    ]);
  });
});
