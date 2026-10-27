import { lineOf, lines, word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { another, logIn } from "./irc.ts";
import { MEMBER, opened, type Scripted } from "./scripted.ts";

// 4d-dm-bar (docs/decisions.md, 2026-10-27): a direct message's lines get the message bar, as a room's: react, reply,
// edit and delete one's own. Still no player (the server sees no direct message, so has no verdict), no link to copy.
// Most journeys run on a scripted Ergo, so the bytes the page sends are read; the last runs two accounts on the real one.
const PARTNER = MEMBER;
const SHORT = `${PARTNER.slice(0, 6)}…${PARTNER.slice(-5)}`;
const barOf = (page: Page, at: number) => lines(page).nth(at).getByRole("toolbar", { name: "Actions on this message" });
const field = (page: Page) => page.getByRole("textbox", { name: `Message ${SHORT}` });
const menu = (page: Page) => page.getByRole("menu", { name: "Message actions" }).getByRole("menuitem");
const flash = (page: Page, text: string) => page.getByRole("status").getByText(text, { exact: true });
// A line as the page sent it, its label (the link's own count) taken off.
// `minute` minutes after the scripted Ergo's echoes begin (11:00:01), so a line of the partner's comes before or after mine.
const at = (minute: number) => new Date(Date.parse("2026-10-25T11:00:00.000Z") + minute * 60_000).toISOString();
const bare = (line: string) => line.replace(/^@label=[^; ]+;?/, "@").replace(/^@ /, "");

// The page's account, in a conversation with PARTNER on a scripted Ergo that echoes what it says: what it sent, as
// sent, and the socket to say a line of the partner's on.
async function inDm(page: Page, script: Scripted = {}) {
  const address = await logIn(page, word("dm"));
  const sent: string[] = [];
  const ergo = await opened(page, address, {
    history: [],
    echo: true,
    heard: (line) => {
      sent.push(line);
    },
    ...script,
  });
  await page.goto(`/w/bubble?dm=${PARTNER}`);
  await hydrated(page);
  await expect(field(page)).toBeVisible();
  await expect(page.getByText("Connecting to the chat…")).toHaveCount(0);
  const theirs = (id: string, text: string, more: { at: number; tags?: string }) => {
    ergo().send(
      `@msgid=${id};time=${at(more.at)};account=${PARTNER}${more.tags ?? ""} :${PARTNER}!u@h PRIVMSG ${address} :${text}`,
    );
  };
  return {
    address,
    ergo,
    theirs,
    says: () => sent.filter((line) => /(PRIVMSG|TAGMSG|REDACT) /.test(line) && !line.includes("+typing=")).map(bare),
  };
}
// A line of mine, written in the field: echoed by the scripted Ergo.
async function write(page: Page, text: string) {
  await field(page).fill(text);
  await field(page).press("Enter");
  await expect(lineOf(page, text)).toHaveCount(1);
}

test.describe("a direct message's bar", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("holds the conversation's items alone: Copy text, with Edit and Delete on one's own, no link and no room's item", async ({
    page,
  }) => {
    const dm = await inDm(page);
    dm.theirs("p1", "from the partner", { at: 0 });
    await expect(lines(page)).toHaveCount(1);
    await write(page, "from me");
    await lines(page).nth(0).hover();
    await barOf(page, 0).getByRole("button", { name: "More actions" }).click();
    await expect(menu(page)).toHaveText(["Copy text"]);
    await page.keyboard.press("Escape");
    await lines(page).nth(1).hover();
    await barOf(page, 1).getByRole("button", { name: "More actions" }).click();
    await expect(menu(page)).toHaveText(["Copy text", "Edit", "Delete"]);
  });

  test("reacts with a quick reaction, shows the partner's, and takes a reaction back", async ({ page }) => {
    const dm = await inDm(page);
    dm.theirs("p1", "from the partner", { at: 0 });
    await expect(lines(page)).toHaveCount(1);
    await lines(page).nth(0).hover();
    await barOf(page, 0).getByRole("button", { name: "React with 👍" }).click();
    await expect(lineOf(page, "from the partner").getByRole("button", { name: "👍, 1, including you" })).toBeVisible();
    dm.ergo().send(
      `@msgid=r9;time=${at(0)};account=${PARTNER};+draft/react=❤️;+reply=p1 :${PARTNER}!u@h TAGMSG ${dm.address}`,
    );
    await expect(lineOf(page, "from the partner").getByRole("button", { name: "❤️, 1" })).toBeVisible();
    await lineOf(page, "from the partner").getByRole("button", { name: "👍, 1, including you" }).click();
    await expect(lineOf(page, "from the partner").getByRole("button", { name: /^👍, / })).toHaveCount(0);
    expect(dm.says()).toEqual([
      `@+draft/react=👍;+reply=p1 TAGMSG ${PARTNER}`,
      `@+draft/unreact=👍;+reply=p1 TAGMSG ${PARTNER}`,
    ]);
  });

  test("replies to a line, quoting it above the answer, tagged +reply", async ({ page }) => {
    const dm = await inDm(page);
    dm.theirs("p1", "are you coming?", { at: 0 });
    await expect(lines(page)).toHaveCount(1);
    await lines(page).nth(0).hover();
    await barOf(page, 0).getByRole("button", { name: "Reply" }).click();
    await expect(page.getByText(`Replying to ${SHORT}: are you coming?`)).toBeVisible();
    await expect(field(page)).toBeFocused();
    await field(page).fill("yes");
    await field(page).press("Enter");
    await expect(lines(page)).toHaveCount(2);
    await expect(lines(page).nth(1)).toContainText(`Replying to ${SHORT}: are you coming?`);
    await expect(page.getByText("Replying to", { exact: false })).toHaveCount(1);
    expect(dm.says()).toEqual([`@+reply=p1 PRIVMSG ${PARTNER} :yes`]);
    // The partner's own reply to my line quotes it too.
    dm.theirs("p2", "great", { at: 5, tags: ";+reply=echo1" });
    await expect(lines(page).nth(2)).toContainText(/Replying to .*: yes/);
  });

  test("edits one's own line: its words in the box, sent as a correction, shown in its place marked edited", async ({
    page,
  }) => {
    const dm = await inDm(page);
    await write(page, "my first words");
    await lines(page).nth(0).hover();
    await barOf(page, 0).getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(page.getByText("Editing a message")).toBeVisible();
    await expect(field(page)).toHaveValue("my first words");
    await expect(field(page)).toBeFocused();
    await field(page).fill("my first words, fixed");
    await field(page).press("Enter");
    await expect(lines(page)).toHaveCount(1);
    await expect(lines(page).nth(0)).toContainText("my first words, fixed");
    await expect(lines(page).nth(0)).toContainText(/Edited/);
    await expect(page.getByText("Editing a message")).toHaveCount(0);
    await expect(field(page)).toHaveValue("");
    expect(dm.says()).toEqual([
      `PRIVMSG ${PARTNER} :my first words`,
      `@+gnoworld/edit=echo1 PRIVMSG ${PARTNER} :my first words, fixed`,
    ]);
  });

  test("leaves an edit unsent on Escape or Cancel, the draft the reader had kept", async ({ page }) => {
    const dm = await inDm(page);
    await write(page, "keep me");
    await field(page).fill("a draft in progress");
    await lines(page).nth(0).hover();
    await barOf(page, 0).getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(field(page)).toHaveValue("keep me");
    await field(page).press("Escape");
    await expect(page.getByText("Editing a message")).toHaveCount(0);
    await expect(field(page)).toHaveValue("a draft in progress");
    await lines(page).nth(0).hover();
    await barOf(page, 0).getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Cancel the edit" }).click();
    await expect(page.getByText("Editing a message")).toHaveCount(0);
    await expect(field(page)).toHaveValue("a draft in progress");
    expect(dm.says()).toEqual([`PRIVMSG ${PARTNER} :keep me`]);
  });

  test("deletes one's own line after asking, with its corrections, by a REDACT to the partner", async ({ page }) => {
    const dm = await inDm(page);
    dm.theirs("p1", "stays", { at: 0 });
    await write(page, "to be deleted");
    await lines(page).nth(1).hover();
    await barOf(page, 1).getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await field(page).fill("to be deleted, fixed");
    await field(page).press("Enter");
    await expect(lines(page).nth(1)).toContainText("to be deleted, fixed");
    await lines(page).nth(1).hover();
    await barOf(page, 1).getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete message?" });
    await expect(dialog).toContainText(`It leaves your conversation with ${SHORT} for both of you`);
    await dialog.getByRole("button", { name: "Delete message" }).click();
    await expect(lines(page)).toHaveCount(1);
    await expect(flash(page, "Message deleted.")).toBeVisible();
    expect(dm.says().filter((line) => line.startsWith("REDACT"))).toEqual([
      `REDACT ${PARTNER} echo1`,
      `REDACT ${PARTNER} echo2`,
    ]);
  });

  test("says Ergo's refusal of a delete, and of a reaction, the line kept", async ({ page }) => {
    const dm = await inDm(page, { refuseRedact: true, refuseReact: true });
    dm.theirs("p1", "theirs", { at: 0 });
    await write(page, "mine");
    await lines(page).nth(0).hover();
    await barOf(page, 0).getByRole("button", { name: "React with 👍" }).click();
    await expect(flash(page, "Could not react.")).toBeVisible();
    await lines(page).nth(1).hover();
    await barOf(page, 1).getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete message?" }).getByRole("button", { name: "Delete message" }).click();
    await expect(flash(page, "Could not delete the message.")).toBeVisible();
    await expect(lineOf(page, "mine")).toHaveCount(1);
  });

  test("offers no player for a link, which stays a link, nor a moderation check's wait", async ({ page }) => {
    const dm = await inDm(page);
    dm.theirs("p1", "watch https://www.youtube.com/watch?v=dQw4w9WgXcQ", { at: 0 });
    await expect(lines(page)).toHaveCount(1);
    await expect(lineOf(page, "watch").getByRole("link")).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    await expect(lineOf(page, "watch").getByRole("status")).toHaveCount(0);
    await expect(lineOf(page, "watch").getByRole("button", { name: "Play the YouTube video" })).toHaveCount(0);
    await expect(lineOf(page, "watch").locator("iframe")).toHaveCount(0);
  });

  test("moves between lines with the arrows and into the bar with Tab, as a room's", async ({ page }) => {
    const dm = await inDm(page);
    dm.theirs("p1", "the first", { at: 0 });
    dm.theirs("p2", "the second", { at: 0 });
    await expect(lines(page)).toHaveCount(2);
    await lines(page).nth(0).focus();
    await page.keyboard.press("ArrowDown");
    await expect(lines(page).nth(1)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(barOf(page, 1).getByRole("button").first()).toBeFocused();
  });

  test("stands on one row on a phone's screen, the three quick reactions behind one React menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const dm = await inDm(page);
    dm.theirs("p1", "the first", { at: 0 });
    await expect(lines(page)).toHaveCount(1);
    await lines(page).nth(0).focus();
    const bar = barOf(page, 0);
    for (const name of ["React", "Reply", "More actions"])
      await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
    await expect(bar.getByRole("button")).toHaveCount(3);
    // One row of controls is about 40 px tall: two would be twice that.
    expect((await bar.boundingBox())?.height ?? Infinity).toBeLessThan(56);
  });

  test("is a guest's none: its page asks to log in and shows no bar", async ({ page }) => {
    await page.goto(`/w/bubble?dm=${PARTNER}`);
    await hydrated(page);
    await expect(page.getByRole("status").filter({ hasText: "Log in to read direct messages." })).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Actions on this message" })).toHaveCount(0);
  });
});

// Two accounts on the real Ergo, each in its conversation with the other: what one does with a line the other sees.
test.describe("a direct message's bar, between two accounts", () => {
  test("shows each act to the partner: a reaction, a reply, an edit and a delete; and says a reaction to an account that left", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-5)}`;
    const bob = await another({ playwright, launchOptions }, word("bob"));
    const me = await logIn(page, word("as"));
    // Bob's page first: connected to Ergo, which delivers a line to an account that is.
    await bob.page.goto(`/w/bubble?dm=${me}`);
    await hydrated(bob.page);
    await expect(bob.page.getByText("No messages since this page opened.")).toBeVisible();
    await page.goto(`/w/bubble?dm=${bob.address}`);
    await hydrated(page);
    const mine = page.getByRole("textbox", { name: `Message ${short(bob.address)}` });
    const his = bob.page.getByRole("textbox", { name: `Message ${short(me)}` });
    await expect(mine).toBeVisible();
    await expect(his).toBeVisible();
    const text = word("hello");
    await mine.fill(text);
    await mine.press("Enter");
    await expect(lineOf(bob.page, text)).toHaveCount(1);
    // A reaction of his shows on my line, mine counted as his.
    await lineOf(bob.page, text).hover();
    await lineOf(bob.page, text).getByRole("toolbar").getByRole("button", { name: "React with 👍" }).click();
    await expect(lineOf(bob.page, text).getByRole("button", { name: "👍, 1, including you" })).toBeVisible();
    await expect(lineOf(page, text).getByRole("button", { name: "👍, 1" })).toBeVisible();
    // His reply quotes my line on both pages.
    await lineOf(bob.page, text).hover();
    await lineOf(bob.page, text).getByRole("toolbar").getByRole("button", { name: "Reply" }).click();
    const answer = word("answer");
    await his.fill(answer);
    await his.press("Enter");
    await expect(lineOf(page, answer)).toContainText(`Replying to ${short(me)}: ${text}`);
    // My edit shows as the line's words on his page, marked edited, the line still one.
    await lineOf(page, text).first().hover();
    await lineOf(page, text).first().getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const fixed = word("fixed");
    await mine.fill(fixed);
    await mine.press("Enter");
    await expect(lines(bob.page).first()).toContainText(fixed);
    await expect(lines(bob.page).first()).toContainText(/Edited/);
    await expect(lines(bob.page)).toHaveCount(2);
    // My delete takes it, its correction too, from his page.
    await lineOf(page, fixed).first().hover();
    await lineOf(page, fixed).first().getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete message?" }).getByRole("button", { name: "Delete message" }).click();
    await expect(lineOf(bob.page, fixed)).toHaveCount(0);
    await expect(lineOf(bob.page, text)).toHaveCount(0);
    // Bob gone, Ergo refuses a reaction to him (401): the page says so, no chip.
    await bob.close();
    await lineOf(page, answer).hover();
    await lineOf(page, answer).getByRole("toolbar").getByRole("button", { name: "React with 👍" }).click();
    await expect(flash(page, "Could not react.")).toBeVisible();
    await expect(lineOf(page, answer).getByRole("button", { name: /^👍, / })).toHaveCount(0);
  });
});
