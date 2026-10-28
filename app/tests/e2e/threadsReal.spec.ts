import { inGames, lineOf, word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { chipOf, inThread, panel, threadField, threadOf } from "./thread.ts";

// 4d's threads through the real Ergo: a reply is a PRIVMSG tagged +reply with the root's msgid, which Ergo relays to the
// room, stores and replays from its history (server/src/testing/ergo.test.ts), so a thread must come back after a
// reload. Another account's reply reaching the open panel is the scripted journey's, and ergo.test.ts's (R18).
const field = (page: Page) => page.getByRole("textbox", { name: "Message #games" });

// A line said in the room's composer, shown once Ergo echoed it.
async function say(page: Page, text: string) {
  await field(page).fill(text);
  await field(page).press("Enter");
  await expect(lineOf(page, text)).toBeVisible();
}

test.describe("threads on the real Ergo", () => {
  test("builds a thread from the replies the account said, and builds it again from Ergo's history", async ({
    page,
  }) => {
    await inGames(page);
    const [root, one, two] = [word("root"), word("one"), word("two")];
    await say(page, root);
    await threadOf(lineOf(page, root));
    await expect(panel(page)).toContainText("No replies yet");
    for (const reply of [one, two]) {
      await threadField(page).fill(reply);
      await threadField(page).press("Enter");
      await expect(inThread(page).filter({ hasText: reply })).toBeVisible();
    }
    await expect(chipOf(lineOf(page, root))).toHaveText(/^2 replies\b/);
    await page.reload();
    await hydrated(page);
    await expect(chipOf(lineOf(page, root))).toHaveText(/^2 replies\b/);
    await chipOf(lineOf(page, root)).click();
    await expect(inThread(page)).toHaveText([new RegExp(root), new RegExp(one), new RegExp(two)]);
    // Ergo's own msgids, which the page sent back as tags, are ones a tag may carry: the thread is whole.
    await expect(panel(page)).toContainText("2 replies");
  });
});
