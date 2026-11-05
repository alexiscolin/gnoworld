import { lines, whoIsHere } from "./chat.ts";
import { open } from "./chatScreenOpen.ts";
import { expect, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { MEMBER } from "./scripted.ts";
import { field, OTHER, room, T } from "./scriptedRoom.ts";
import { chipOf, inThread, panel } from "./thread.ts";

// 5q fix pass: what the review of the chat found lost or wrong, by journey (rows 3, 5, 6, 7, 18, 27).
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const message = (page: import("./fixtures.ts").Page) => page.getByRole("group", { name: "Message box" });

test.describe("the chat's fixes", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  // Row 3: Who's here then Message on a phone left the dialog open over the conversation, the field never focused.
  test("closes the people's dialog on a phone when Message opens the conversation, the field taking the focus", async ({
    page,
  }) => {
    await logIn(page, "fix-phone");
    await open(page, { width: 390, as: ACCOUNT });
    await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Who's here" }).click();
    const dialog = page.getByRole("dialog", { name: "Who's here" });
    await expect(dialog).toContainText("here now");
    await dialog
      .getByRole("button", { name: /^Message/ })
      .first()
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: /^Direct message with/ })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Message / })).toBeFocused();
  });

  // Row 5: a conversation had no dock, no inset, no Who's here.
  test("draws a conversation's composer in the same dock as a room's: the quick actions, the inset, the rule", async ({
    page,
  }) => {
    await logIn(page, "fix-dm");
    await open(page, { width: 1280, as: ACCOUNT });
    await whoIsHere(page)
      .getByRole("button", { name: /^Message/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 2, name: /^Direct message with/ })).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button")).toHaveText([
      "Who's here",
      "Quiz",
    ]);
    const [box, talk] = await Promise.all([
      message(page).boundingBox(),
      page.locator('[data-region="conversation"]').boundingBox(),
    ]);
    if (box === null || talk === null) throw new Error("not drawn");
    expect(box.x).toBeGreaterThan(talk.x + 16);
    expect(talk.y + talk.height - (box.y + box.height)).toBeGreaterThan(12);
  });

  // Row 6: the list shrinks as the composer grows; the reader at the end who writes lost the newest lines.
  test("keeps the newest line in view as the draft grows to six lines", async ({ page }) => {
    await logIn(page, "fix-grow");
    await room(page, {
      me: ACCOUNT,
      history: Array.from({ length: 40 }, (_, n) => [`m${String(n)}`, T(n), `line number ${String(n)}`] as const),
    });
    const list = page.getByRole("list", { name: "Messages" });
    await expect(list.locator(":scope > li").last()).toBeInViewport();
    await field(page).fill(["one", "two", "three", "four", "five", "six"].join("\n"));
    await expect
      .poll(async () => {
        const [newest, box] = await Promise.all([list.locator(":scope > li").last().boundingBox(), list.boundingBox()]);
        return newest === null || box === null ? Infinity : newest.y + newest.height - (box.y + box.height);
      })
      .toBeLessThanOrEqual(1);
  });

  // Row 7: with a thread open Who's here did nothing, and a click otherwise moved no visible thing.
  test("closes the open thread and lands on the people, with a ring, when Who's here is pressed", async ({ page }) => {
    await logIn(page, "fix-thread");
    const opened = await room(page, {
      me: ACCOUNT,
      history: [
        ["m1", T(0), "the root line"],
        ["m2", T(1), "another"],
      ],
    });
    opened
      .ergo()
      .send(`@msgid=m3;time=${T(2)};account=${OTHER};+reply=m1 :${OTHER}!u@h PRIVMSG #bubble/games :an answer`);
    await expect(lines(page)).toHaveCount(3);
    await chipOf(lines(page).first()).click();
    await expect(panel(page)).toBeVisible();
    await expect(inThread(page).first()).toContainText("the root line");
    await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Who's here" }).click();
    await expect(panel(page)).toHaveCount(0);
    const info = page.getByRole("complementary", { name: "Bubble" });
    await expect(info).toBeFocused();
    expect(await info.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
    await expect(info.getByText(MEMBER.slice(0, 6))).toBeVisible();
  });

  // Row 18: @ and / did nothing in no journey.
  test("puts @ and / in the draft from the foot's marks, and keeps the focus in the field", async ({ page }) => {
    await logIn(page, "fix-marks");
    await open(page, { width: 1280, as: ACCOUNT });
    const text = page.getByRole("textbox", { name: "Message #games" });
    await text.fill("hello ");
    await message(page).getByRole("button", { name: "Mention someone" }).click();
    await expect(text).toHaveValue("hello @");
    await expect(text).toBeFocused();
    await message(page).getByRole("button", { name: "Start a command" }).click();
    await expect(text).toHaveValue("hello @/");
    await expect(text).toBeFocused();
  });

  // Row 27: a press released outside the list left the next keyboard focus without its bar in view.
  test("brings a line's bar into view for the keyboard after a press released outside the list", async ({ page }) => {
    await logIn(page, "fix-press");
    await room(page, {
      me: ACCOUNT,
      history: Array.from({ length: 30 }, (_, n) => [`m${String(n)}`, T(n), `line number ${String(n)}`] as const),
    });
    const list = page.getByRole("list", { name: "Messages" });
    const box = await list.boundingBox();
    if (box === null) throw new Error("not drawn");
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y - 40);
    await page.mouse.up();
    // A line at the list's top edge: its bar, which rises above it, is cut until the focus brings it into view.
    await lines(page)
      .nth(10)
      .evaluate((element) => {
        element.scrollIntoView({ block: "start" });
      });
    await lines(page).nth(10).focus();
    await expect(lines(page).nth(10).getByRole("toolbar")).toBeInViewport({ ratio: 1 });
  });
});
