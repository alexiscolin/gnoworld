import { lineOf, lines, roomsNav } from "./chat.ts";
import type { Locator } from "@playwright/test";
import { expect, test, type Page } from "./fixtures.ts";
import { opened } from "./scripted.ts";
import { asAccount, barOf, field, GUEST, HISTORY, OTHER, ROOM, T, tagged } from "./talk.ts";

// 4d's replies (docs/decisions.md, 2026-10-26): Reply on a line's bar; the composer says which line the next answers,
// sends it tagged +reply, and the reply quotes its line; the target is the room's, gone with a room switch, with its
// line deleted, or once the line went out. A scripted Ergo (scripted.ts).
const form = (page: Page) => page.getByRole("form", { name: "Write in #games" });
const cancel = (page: Page) => page.getByRole("button", { name: "Cancel the reply" });
const replyTo = async (page: Page, at: number) => {
  await lines(page).nth(at).hover();
  await barOf(page, at).getByRole("button", { name: "Reply" }).click();
};

test.describe("replies", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("reply from the bar: the composer says to which line, sends it tagged, and the reply quotes its line", async ({
    page,
  }) => {
    const { said } = await asAccount(page);
    await replyTo(page, 0);
    await expect(form(page)).toContainText("Replying to g10gh7…3y5tv: the first line");
    await expect(field(page)).toBeFocused();
    await field(page).fill("count me in");
    await field(page).press("Enter");
    await expect(lineOf(page, "count me in")).toContainText("Replying to g10gh7…3y5tv: the first line");
    await expect(cancel(page)).toHaveCount(0);
    expect(said()).toEqual([`@+reply=m1 PRIVMSG ${ROOM} :count me in`]);
  });

  test("cancel a reply: the next line answers none", async ({ page }) => {
    const { said } = await asAccount(page);
    await replyTo(page, 1);
    await cancel(page).click();
    await expect(cancel(page)).toHaveCount(0);
    await field(page).fill("plain");
    await field(page).press("Enter");
    await expect(lineOf(page, "plain")).toBeVisible();
    expect(said()).toEqual([`PRIVMSG ${ROOM} :plain`]);
  });

  // F1175 (the UX review's U3): Escape in the field cancels the reply, as the Cancel button does, and keeps the draft.
  test("cancel a reply with Escape in the field, the draft and the focus kept", async ({ page }) => {
    const { said } = await asAccount(page);
    await replyTo(page, 1);
    await field(page).fill("half a thought");
    await field(page).press("Escape");
    await expect(cancel(page)).toHaveCount(0);
    await expect(form(page)).not.toContainText("Replying to");
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveText("half a thought");
    await field(page).press("Enter");
    await expect(lineOf(page, "half a thought")).toBeVisible();
    expect(said()).toEqual([`PRIVMSG ${ROOM} :half a thought`]);
  });

  // F1178 (the UX review's U6): a quote stays one line, cut by an ellipsis, wherever it is: over the field the cancel
  // stands on its row, and on a phone's width too.
  test("keep a reply's quote and the reply bar to one line on a phone's screen, the cancel on the bar's row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const long = "a long line to answer, long enough to wrap twice in a narrow column, and then some more";
    await asAccount(
      page,
      () => ({
        history: [...HISTORY, ["m3", T(2), long]],
        replayed: [tagged("m4", "agreed", { at: 3, tags: "+reply=m3", who: OTHER })],
      }),
      4,
    );
    // The words' boxes all start at one height: they are on one line.
    const oneRow = (box: Locator) =>
      box.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const tops = [...range.getClientRects()].map((rect) => rect.top);
        return Math.max(...tops) - Math.min(...tops) < parseFloat(getComputedStyle(element).fontSize) / 2;
      });
    const quote = lineOf(page, "agreed").locator("p");
    expect(await oneRow(quote)).toBe(true);
    await replyTo(page, 2);
    const bar = form(page).locator("p").first();
    await expect(bar).toContainText("a long line");
    expect(await oneRow(bar)).toBe(true);
    // Both boxes read in one frame: the page may still be scrolling to the field, which moves them together.
    const row = await bar.evaluate(
      (words, button) => {
        const [at, to] = [words.getBoundingClientRect(), button.getBoundingClientRect()];
        return { offset: to.y - at.y, height: at.height };
      },
      await cancel(page).elementHandle(),
    );
    expect(row.offset).toBeGreaterThanOrEqual(-8);
    expect(row.offset).toBeLessThan(row.height);
  });

  test("answer the line of the second Reply, not the first's", async ({ page }) => {
    const { said } = await asAccount(page);
    await replyTo(page, 0);
    await replyTo(page, 1);
    await expect(form(page)).toContainText("Replying to g10gh7…3y5tv: the second line");
    await field(page).fill("this one");
    await field(page).press("Enter");
    await expect(lineOf(page, "this one")).toBeVisible();
    expect(said()).toEqual([`@+reply=m2 PRIVMSG ${ROOM} :this one`]);
  });

  // The green pass (G8): each Reply puts the focus in the field, the same line's again included.
  test("put the focus in the field at each Reply, the same line's a second time too", async ({ page }) => {
    await asAccount(page);
    await replyTo(page, 0);
    await expect(field(page)).toBeFocused();
    await lines(page).nth(1).focus();
    // The focus moved: its line's bar shows until the pointer moves again (U11); it leaves, then comes back.
    await page.mouse.move(0, 0);
    await replyTo(page, 0);
    await expect(field(page)).toBeFocused();
    await replyTo(page, 1);
    await expect(form(page)).toContainText("Replying to g10gh7…3y5tv: the second line");
    await expect(field(page)).toBeFocused();
  });

  // The code review (CR2): an edit of the line being answered changes the words the composer quotes, never the focus.
  test("leave the focus where the reader put it when the line being answered is edited", async ({ page }) => {
    const { ergo } = await asAccount(page);
    await replyTo(page, 1);
    await expect(field(page)).toBeFocused();
    const rooms = roomsNav(page).getByRole("link").first();
    await rooms.focus();
    ergo().send(tagged("e1", "the second line, fixed", { at: 30, tags: "+gnoworld/edit=m2" }));
    await expect(form(page)).toContainText("the second line, fixed");
    await expect(rooms).toBeFocused();
  });

  // The code review (CR4): the reply cancelled, the focus goes to the field, never to the page.
  test("give the field the focus once the reply is cancelled", async ({ page }) => {
    await asAccount(page);
    await replyTo(page, 1);
    await cancel(page).focus();
    await page.keyboard.press("Enter");
    await expect(cancel(page)).toHaveCount(0);
    await expect(field(page)).toBeFocused();
  });

  // The green pass (G7): the composer quotes a line as the room shows it, its author's edit folded in.
  test("quote an edited line by its edited words", async ({ page }) => {
    await asAccount(page, () => ({
      replayed: [tagged("e1", "the first line, fixed", { at: 2, tags: "+gnoworld/edit=m1" })],
    }));
    await expect(lines(page).nth(0)).toContainText("the first line, fixed");
    await replyTo(page, 0);
    await expect(form(page)).toContainText("Replying to g10gh7…3y5tv: the first line, fixed");
  });

  // R4: the line being answered is the room's: another room's line goes out answering none, and the reply is gone on
  // coming back.
  test("leave the reply behind on a room switch: the other room's line answers none", async ({ page }) => {
    const { said } = await asAccount(page);
    await replyTo(page, 0);
    await page.keyboard.press("Alt+ArrowDown");
    const there = page.getByRole("textbox", { name: "Message #bubble" });
    await expect(there).toBeVisible();
    await expect(cancel(page)).toHaveCount(0);
    await there.fill("elsewhere");
    await there.press("Enter");
    await expect(lineOf(page, "elsewhere")).toBeVisible();
    await roomsNav(page).getByRole("link", { name: "games", exact: true }).click();
    await expect(field(page)).toBeVisible();
    await expect(cancel(page)).toHaveCount(0);
    expect(said()).toEqual(["PRIVMSG #bubble :elsewhere"]);
  });

  test("drop the reply when its line is deleted: the next line answers none", async ({ page }) => {
    const { ergo, said } = await asAccount(page);
    await replyTo(page, 0);
    ergo().send(`:gnoworld!u@h REDACT ${ROOM} m1`);
    await expect(lines(page)).toHaveCount(1);
    await expect(cancel(page)).toHaveCount(0);
    await field(page).fill("after");
    await field(page).press("Enter");
    await expect(lineOf(page, "after")).toBeVisible();
    expect(said()).toEqual([`PRIVMSG ${ROOM} :after`]);
  });

  test("keep the reply when the line could not go out", async ({ page }) => {
    const { ergo, address, said } = await asAccount(page);
    await replyTo(page, 0);
    ergo().send(`:op!u@h KICK ${ROOM} ${address} :out`);
    await field(page).fill("not now");
    await field(page).press("Enter");
    await expect(form(page)).toContainText("Not sent");
    await expect(form(page)).toContainText("Replying to g10gh7…3y5tv: the first line");
    await expect(field(page)).toHaveText("not now");
    expect(said()).toEqual([]);
  });

  test("say a reply answers an earlier message when its line is not in the room's window", async ({ page }) => {
    await opened(page, GUEST, {
      history: HISTORY,
      replayed: [tagged("m3", "late answer", { at: 2, tags: "+reply=long-gone" })],
    });
    await expect(lineOf(page, "late answer")).toContainText("Replying to an earlier message");
  });

  test("reach the bar's quick reactions, Reply and More by Tab from a focused line, for an account", async ({
    page,
  }) => {
    await asAccount(page);
    await lines(page).nth(1).focus();
    for (const name of [
      "React with 👍",
      "React with ❤️",
      "React with 😂",
      "Add reaction",
      "Reply",
      "Open thread",
      "Copy room link",
      "More actions",
    ]) {
      await page.keyboard.press("Tab");
      await expect(barOf(page, 1).getByRole("button", { name })).toBeFocused();
    }
  });
});
