import { lines } from "./chat.ts";
import { expect, test } from "./fixtures.ts";
import { opened } from "./scripted.ts";
import { GUEST, HISTORY, OTHER, tagged } from "./talk.ts";

// 4d's edits shown (F664; docs/decisions.md, 2026-10-21): a correction by the line's own account shown in its place,
// marked edited; another account's a line of its own, as a plain IRC client shows it. A scripted Ergo (scripted.ts).
test.describe("edits", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("show an edit by the line's own account in its place, marked edited; another account's, as a line", async ({
    page,
  }) => {
    await opened(page, GUEST, {
      history: HISTORY,
      replayed: [
        tagged("e1", "the first line, fixed", { at: 2, tags: "+gnoworld/edit=m1" }),
        tagged("e2", "not yours to fix", { at: 3, tags: "+gnoworld/edit=m2", who: OTHER }),
      ],
    });
    await expect(lines(page)).toHaveCount(3);
    await expect(lines(page).nth(0)).toContainText("the first line, fixed");
    await expect(lines(page).nth(0)).toContainText(/^(Edited )?\d{2}:\d{2}( Edited)? /);
    await expect(lines(page).nth(1)).toContainText("the second line");
    await expect(lines(page).nth(2)).toContainText("not yours to fix");
  });

  test("show a live edit in its line's place", async ({ page }) => {
    const ergo = await opened(page, GUEST, { history: HISTORY });
    await expect(lines(page)).toHaveCount(2);
    ergo().send(tagged("e1", "the second line, fixed", { at: 30, tags: "+gnoworld/edit=m2" }));
    await expect(lines(page).nth(1)).toContainText("the second line, fixed");
    await expect(lines(page).nth(1)).toContainText(/edited/i);
    await expect(lines(page)).toHaveCount(2);
  });
});
