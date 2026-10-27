import { lineOf, lines, roomsNav } from "./chat.ts";
import { expect, test } from "./fixtures.ts";
import type { HistoryLine } from "./scripted.ts";
import { asAccount, ROOM, T, tagged } from "./talk.ts";
import { chipOf, closeButton, inThread, panel, say, threadField, threadOf } from "./thread.ts";

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

  // CR1 (F1761): words typed in a thread are not lost to an Escape, another thread or a room; kept in the page's memory.
  test("keeps the words typed in a thread through Escape, another thread and a room, till they are sent", async ({
    page,
  }) => {
    const history: HistoryLine[] = [
      ["m1", T(0), "the root line"],
      ["m2", T(1), "an unrelated line"],
    ];
    const { said } = await asAccount(
      page,
      () => ({ history, replayed: [tagged("m3", "a reply", { at: 2, tags: "+reply=m1" })] }),
      3,
    );
    await chipOf(lines(page).first()).click();
    await threadField(page).fill("half a thought");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await chipOf(lines(page).first()).click();
    await expect(threadField(page)).toHaveValue("half a thought");
    // Another thread has its own field; this one's words wait.
    await threadOf(lineOf(page, "an unrelated line"));
    await expect(threadField(page)).toHaveValue("");
    await threadField(page).fill("for the other");
    await chipOf(lines(page).first()).click();
    await expect(threadField(page)).toHaveValue("half a thought");
    await roomsNav(page).getByRole("link", { name: "#bubble" }).click();
    await expect(panel(page)).toHaveCount(0);
    await roomsNav(page).getByRole("link", { name: "#games" }).click();
    await chipOf(lines(page).first()).click();
    await expect(threadField(page)).toHaveValue("half a thought");
    // Memory only: no draft of the panel's is on the device.
    const kept = await page.evaluate(() => JSON.stringify(localStorage));
    expect(kept).not.toContain("half a thought");
    expect(kept).not.toContain("for the other");
    await say(page, "half a thought");
    await expect(inThread(page)).toHaveCount(3);
    expect(said()).toEqual([`@+reply=m1 PRIVMSG ${ROOM} :half a thought`]);
    await closeButton(page).click();
    await chipOf(lines(page).first()).click();
    await expect(threadField(page)).toHaveValue("");
  });
});
