import { lineOf, lines } from "./chat.ts";
import { expect, test } from "./fixtures.ts";
import type { HistoryLine } from "./scripted.ts";
import { asAccount, ROOM, T, tagged } from "./talk.ts";
import { closeButton, inThread, panel, say, threadOf } from "./thread.ts";

// What the code review of 4d's threads found (docs/review/findings.md, F1760 on): each journey fails without its fix.
test.describe("threads, from the review", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  // CR9 (F1760): the panel reads its root from the room's lines each time it draws, not once at the click.
  test("follows a chain that grows while its panel is open: the root it now has, and its tag", async ({ page }) => {
    const history: HistoryLine[] = [["m1", T(0), "the first root"]];
    const { ergo, said } = await asAccount(
      page,
      () => ({ history, replayed: [tagged("m3", "the late reply", { at: 3, tags: "+reply=m2" })] }),
      2,
    );
    await threadOf(lineOf(page, "the late reply"));
    await expect(panel(page)).toContainText(/earlier message/i);
    await expect(inThread(page)).toHaveText([/the late reply/]);
    // The line it answers comes, itself an answer to the first: one thread now, rooted in the first.
    ergo().send(tagged("m2", "the middle", { at: 2, tags: "+reply=m1" }));
    await expect(lines(page)).toHaveCount(3);
    await expect(inThread(page)).toHaveText([/the first root/, /the middle/, /the late reply/]);
    await expect(panel(page)).toContainText("2 replies");
    await say(page, "to the root");
    await expect(inThread(page)).toHaveCount(4);
    expect(said()).toEqual([`@+reply=m1 PRIVMSG ${ROOM} :to the root`]);
    await closeButton(page).click();
  });
});
