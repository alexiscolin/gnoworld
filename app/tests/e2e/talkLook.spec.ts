import AxeBuilder from "@axe-core/playwright";
import { inGames, lineOf, lines, word } from "./chat.ts";
import { expect, hydrated, test } from "./fixtures.ts";
import type { Scripted } from "./scripted.ts";
import { asAccount, barOf, field, OTHER, tagged, tagmsg } from "./talk.ts";

// 4d's reactions, replies and edits as they look and as a real Ergo keeps them (docs/decisions.md, 2026-10-26).
const LOOK = (address: string): Scripted => ({
  replayed: [
    tagmsg("r1", "+draft/react=👍;+reply=m1", { at: 2, who: OTHER }),
    tagmsg("r2", "+draft/react=👍;+reply=m1", { at: 3, who: address }),
    tagmsg("r3", "+draft/react=😂;+reply=m1", { at: 4, who: OTHER }),
    tagged("e1", "the second **line**, fixed", { at: 5, tags: "+gnoworld/edit=m2" }),
    tagged("m3", "count me in", { at: 6, tags: "+reply=m1", who: OTHER }),
  ],
});

test.describe("reactions, replies and edits, as they look", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("pass axe with reactions, a reply, an edit and a line's bar shown", async ({ page }) => {
    await asAccount(page, LOOK, { shown: 3 });
    await lineOf(page, "count me in").hover();
    await expect(barOf(page, 2)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("look as the prototype's on a computer's screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // The same account each run: its address, in Who's here, sets the list's width.
    await asAccount(page, LOOK, { shown: 3, as: "talk-look" });
    // The first line by its place: the reply quotes its words too.
    await lines(page).first().hover();
    await expect(barOf(page, 0)).toBeVisible();
    await expect(page.getByRole("list", { name: "Messages" })).toHaveScreenshot("talk-computer.png");
  });
});

// A real Ergo keeps a reaction (tagmsg-storage) and a reply's tag (client tags replayed): a reload shows both.
test("keeps a reaction and a reply through a reload, in Ergo too", async ({ page }) => {
  await inGames(page);
  const text = word("react");
  await field(page).fill(text);
  await field(page).press("Enter");
  await expect(lineOf(page, text)).toHaveCount(1);
  // Focused, not pointed at: other journeys' lines arrive in the real Ergo's #games and move it from under the pointer.
  await lineOf(page, text).focus();
  await lineOf(page, text).getByRole("button", { name: "React with 😂" }).click();
  await expect(lineOf(page, text).getByRole("button", { name: "😂, 1, including you" })).toBeVisible();
  await lineOf(page, text).focus();
  await lineOf(page, text).getByRole("button", { name: "Reply" }).click();
  const answer = word("answer");
  await field(page).fill(answer);
  await field(page).press("Enter");
  await expect(lineOf(page, answer)).toContainText(text);
  await page.reload();
  await hydrated(page);
  await expect(lineOf(page, text).getByRole("button", { name: "😂, 1, including you" })).toBeVisible();
  await expect(lineOf(page, answer)).toContainText(`Replying to`);
  await expect(lineOf(page, answer)).toContainText(text);
});
