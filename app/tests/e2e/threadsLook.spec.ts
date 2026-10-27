import { lines } from "./chat.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { MEMBER } from "./scripted.ts";
import { asAccount, OTHER, T, tagged } from "./talk.ts";
import { chipOf, inThread, panel, threadField } from "./thread.ts";

// How a thread looks (slice 4's 4d threads), on a computer's screen and a phone's: its chip under the root, and its panel
// beside the room (or in its place) with a long root, a reply with a mention and a reply to a reply. A scripted Ergo
// (scripted.ts); the header, which names the test wallet, is masked.
const SCREENS = [
  ["computer", 1280],
  ["phone", 390],
] as const;

async function room(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await asAccount(
    page,
    () => ({
      history: [
        [
          "m1",
          T(0),
          "Who is up for a round of **gnogolf** tonight? Rules are at https://gno.land/r/demo and the course opens at nine, bring your own clubs.",
        ],
        ["m2", T(1), "an unrelated line"],
      ],
      replayed: [
        tagged("m3", `Count me in, @${MEMBER} too.`, { at: 2, tags: "+reply=m1", who: OTHER }),
        tagged("m4", "Nine is fine.", { at: 3, tags: "+reply=m3" }),
      ],
    }),
    4,
  );
}

test.describe("a thread, as it looks", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  for (const [screen, width] of SCREENS) {
    test(`its chip under the root, on a ${screen}'s screen`, async ({ page }) => {
      await room(page, width);
      await expect(chipOf(lines(page).first())).toHaveText(/^2 replies\b/);
      // Who's here holds the account's address, a new one each run (the test wallet draws its key): masked too.
      const here = page.getByRole("complementary", { name: "Who's here" });
      await expect(page).toHaveScreenshot(`thread-chip-${screen}.png`, { mask: [page.getByRole("banner"), here] });
    });

    test(`its panel open, on a ${screen}'s screen`, async ({ page }) => {
      await room(page, width);
      // Pointed at first: on a phone the bar stands in the flow, and would move the chip under the press.
      await lines(page).first().hover();
      await chipOf(lines(page).first()).click();
      await expect(inThread(page)).toHaveCount(3);
      await expect(threadField(page)).toBeFocused();
      await expect(panel(page)).toBeVisible();
      await expect(page).toHaveScreenshot(`thread-panel-${screen}.png`, { mask: [page.getByRole("banner")] });
    });
  }
});
