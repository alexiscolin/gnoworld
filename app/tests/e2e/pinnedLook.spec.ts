import { expect, test, type Page } from "./fixtures.ts";
import { openGovdao } from "./govdaoChain.ts";

// GovDAO's pinned Vote as it looks at the video's size (9e-1; frames 26 and 30): the form under Read the proposals, the pill beside
// Who's here, and the card it opens over the bar. The pictures are made and approved on the Mac Studio (decision 4238523f).
test.describe("GovDAO's pinned Vote, as it looks", () => {
  test.use({ deviceScaleFactor: 1, timezoneId: "UTC", locale: "en-GB" });

  test("the form on the page, the pill in the bar and its card", async ({ page }: { page: Page }) => {
    await openGovdao(page, 1728);
    const mask = [page.getByRole("banner")];
    const form = page.locator("[data-look='plate']").getByRole("figure");
    await expect(form).toHaveScreenshot("pinned-form.png", { mask });
    const bar = page.getByRole("toolbar", { name: "Quick actions" });
    await expect(bar.getByRole("button", { name: "Vote" })).toBeVisible();
    await expect(bar).toHaveScreenshot("pinned-bar.png", { mask });
    await bar.getByRole("button", { name: "Vote" }).click();
    await expect(page.getByRole("article").filter({ hasText: "MustVoteOnProposalSimple" })).toHaveScreenshot(
      "pinned-card.png",
      { mask },
    );
  });
});
