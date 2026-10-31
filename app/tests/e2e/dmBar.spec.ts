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
  await page.goto(`/w/bubble?dm=${PARTNER}&chat=full`);
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

// The partner says "are you coming?", and Reply is chosen on that line.
async function startReply(page: Page, dm: { theirs: (id: string, text: string, more: { at: number }) => void }) {
  dm.theirs("p1", "are you coming?", { at: 0 });
  await expect(lines(page)).toHaveCount(1);
  await lines(page).nth(0).hover();
  await barOf(page, 0).getByRole("button", { name: "Reply" }).click();
}

// Edit chosen from a line's menu, the line at `at`.
async function startEdit(page: Page, at: number) {
  await lines(page).nth(at).hover();
  await barOf(page, at).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
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
    await startReply(page, dm);
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

  // R2 and R7(a) (redpass-dmb): what is typed in the edit box never reaches the reader's kept draft, and the focus stays in
  // the field when the edit goes.
  test("leaves an edit unsent on Escape or Cancel, the draft the reader had kept, the focus in the field", async ({
    page,
  }) => {
    const dm = await inDm(page);
    await write(page, "keep me");
    await field(page).fill("a draft in progress");
    await startEdit(page, 0);
    await expect(field(page)).toHaveValue("keep me");
    await field(page).fill("keep me, typed in the edit");
    await field(page).press("Escape");
    await expect(page.getByText("Editing a message")).toHaveCount(0);
    await expect(field(page)).toHaveValue("a draft in progress");
    await expect(field(page)).toBeFocused();
    await startEdit(page, 0);
    await field(page).fill("keep me, typed again");
    await page.getByRole("button", { name: "Cancel the edit" }).click();
    await expect(page.getByText("Editing a message")).toHaveCount(0);
    await expect(field(page)).toHaveValue("a draft in progress");
    await expect(field(page)).toBeFocused();
    expect(dm.says()).toEqual([`PRIVMSG ${PARTNER} :keep me`]);
  });

  test("gives the reader's draft back in the box once an edit is saved", async ({ page }) => {
    const dm = await inDm(page);
    await write(page, "keep me");
    await field(page).fill("a draft in progress");
    await startEdit(page, 0);
    await field(page).fill("keep me, fixed");
    await field(page).press("Enter");
    await expect(lines(page).nth(0)).toContainText("keep me, fixed");
    await expect(field(page)).toHaveValue("a draft in progress");
    expect(dm.says()).toEqual([
      `PRIVMSG ${PARTNER} :keep me`,
      `@+gnoworld/edit=echo1 PRIVMSG ${PARTNER} :keep me, fixed`,
    ]);
  });

  // R5: the second edit of a line names the line, not the first edit, and starts from the edited words.
  test("edits a line twice: each correction names the original line, the box starting from the last words", async ({
    page,
  }) => {
    const dm = await inDm(page);
    await write(page, "first words");
    await startEdit(page, 0);
    await field(page).fill("second words");
    await field(page).press("Enter");
    await expect(lines(page).nth(0)).toContainText("second words");
    await startEdit(page, 0);
    await expect(field(page)).toHaveValue("second words");
    await field(page).fill("third words");
    await field(page).press("Enter");
    await expect(lines(page).nth(0)).toContainText("third words");
    await expect(lines(page)).toHaveCount(1);
    expect(dm.says()).toEqual([
      `PRIVMSG ${PARTNER} :first words`,
      `@+gnoworld/edit=echo1 PRIVMSG ${PARTNER} :second words`,
      `@+gnoworld/edit=echo1 PRIVMSG ${PARTNER} :third words`,
    ]);
  });

  // R7(b), decided by Claude: an emptied box sends nothing and stays in edit mode; unchanged words close the edit, sending nothing.
  test("sends nothing for an edit emptied, which stays open, nor for one left as it was, which closes", async ({
    page,
  }) => {
    const dm = await inDm(page);
    await write(page, "as written");
    await startEdit(page, 0);
    await field(page).fill("");
    await field(page).press("Enter");
    await expect(page.getByText("Editing a message")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await field(page).fill("as written");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Editing a message")).toHaveCount(0);
    await expect(lines(page)).toHaveCount(1);
    await expect(lines(page).nth(0)).not.toContainText(/Edited/);
    expect(dm.says()).toEqual([`PRIVMSG ${PARTNER} :as written`]);
  });

  // R7(c), decided by Claude: Edit drops a pending Reply, so the next plain message answers nothing.
  test("drops a pending reply when Edit is chosen: the correction and the next line carry no +reply", async ({
    page,
  }) => {
    const dm = await inDm(page);
    dm.theirs("p1", "are you coming?", { at: 0 });
    await expect(lines(page)).toHaveCount(1);
    await write(page, "mine");
    await lines(page).nth(0).hover();
    await barOf(page, 0).getByRole("button", { name: "Reply" }).click();
    await expect(page.getByText("Replying to", { exact: false })).toHaveCount(1);
    await startEdit(page, 1);
    await expect(page.getByText("Replying to", { exact: false })).toHaveCount(0);
    await field(page).fill("mine, fixed");
    await field(page).press("Enter");
    await expect(lines(page).nth(1)).toContainText("mine, fixed");
    await expect(page.getByText("Replying to", { exact: false })).toHaveCount(0);
    await write(page, "next");
    expect(dm.says()).toEqual([
      `PRIVMSG ${PARTNER} :mine`,
      `@+gnoworld/edit=echo1 PRIVMSG ${PARTNER} :mine, fixed`,
      `PRIVMSG ${PARTNER} :next`,
    ]);
  });

  // R8, F1562 answered by Claude (keep), then CR2 (F1871): a refused edit's words come back in the box with the edit open
  // again, and why is said; Save sends the correction tagged as before, not a new message beside the line.
  test("puts a refused edit's words back in the box, saying its partner is not online, the line unchanged", async ({
    page,
  }) => {
    const dm = await inDm(page, { refuseTagged: true });
    await write(page, "as written");
    await startEdit(page, 0);
    await field(page).fill("as written, fixed");
    await field(page).press("Enter");
    await expect(page.getByText(`Not sent: ${SHORT} is not online.`, { exact: true })).toBeVisible();
    await expect(page.getByText("Editing a message")).toBeVisible();
    await expect(field(page)).toHaveValue("as written, fixed");
    await expect(lines(page)).toHaveCount(1);
    await expect(lines(page).nth(0)).toContainText("as written");
    await expect(lines(page).nth(0)).not.toContainText("as written, fixed");
    await field(page).press("Enter");
    await expect.poll(() => dm.says().length).toBe(3);
    expect(dm.says()).toEqual([
      `PRIVMSG ${PARTNER} :as written`,
      `@+gnoworld/edit=echo1 PRIVMSG ${PARTNER} :as written, fixed`,
      `@+gnoworld/edit=echo1 PRIVMSG ${PARTNER} :as written, fixed`,
    ]);
  });

  test("puts a refused reply's words back in the box, saying its partner is not online", async ({ page }) => {
    const dm = await inDm(page, { refuseTagged: true });
    await startReply(page, dm);
    await field(page).fill("yes");
    await field(page).press("Enter");
    await expect(page.getByText(`Not sent: ${SHORT} is not online.`, { exact: true })).toBeVisible();
    await expect(field(page)).toHaveValue("yes");
    await expect(page.getByText(`Replying to ${SHORT}: are you coming?`)).toBeVisible();
    await expect(lines(page)).toHaveCount(1);
    await field(page).press("Enter");
    await expect.poll(() => dm.says().length).toBe(2);
    expect(dm.says()).toEqual([`@+reply=p1 PRIVMSG ${PARTNER} :yes`, `@+reply=p1 PRIVMSG ${PARTNER} :yes`]);
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
    // The correction's REDACT first, the line's last (F2001).
    expect(dm.says().filter((line) => line.startsWith("REDACT"))).toEqual([
      `REDACT ${PARTNER} echo2`,
      `REDACT ${PARTNER} echo1`,
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

  // R10: the edit bar, its buttons and a long line fit a phone's width.
  test("fits a phone's screen while a line is edited: the bar, the field and both buttons in view, no sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const dm = await inDm(page);
    await write(page, `a long line ${"words ".repeat(40)}end`);
    await lines(page).nth(0).focus();
    await barOf(page, 0).getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(page.getByText("Editing a message")).toBeVisible();
    for (const target of [
      field(page),
      page.getByRole("button", { name: "Save", exact: true }),
      page.getByRole("button", { name: "Cancel the edit" }),
    ]) {
      await expect(target).toBeVisible();
      await expect(target).toBeInViewport();
    }
    const [scroll, client] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(scroll).toBeLessThanOrEqual(client);
    expect(dm.says()).toHaveLength(1);
  });

  test("is a guest's none: its page asks to log in and shows no bar", async ({ page }) => {
    await page.goto(`/w/bubble?dm=${PARTNER}&chat=full`);
    await hydrated(page);
    await expect(page.getByRole("status").filter({ hasText: "Log in to read direct messages." })).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Actions on this message" })).toHaveCount(0);
  });
});

// Two accounts on the real Ergo, each in its conversation with the other: what one does with a line the other sees. Each
// journey is its own, so its name says which act failed (R9).
test.describe("a direct message's bar, between two accounts", () => {
  const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-5)}`;
  // Bob's page first, connected to Ergo, which delivers a line to an account that is; then mine, and one line of mine.
  async function twoAccounts(args: Parameters<typeof another>[0], page: Page) {
    const bob = await another(args, word("bob"));
    const me = await logIn(page, word("as"));
    await bob.page.goto(`/w/bubble?dm=${me}&chat=full`);
    await hydrated(bob.page);
    await expect(bob.page.getByText("No messages since this page opened.")).toBeVisible();
    await page.goto(`/w/bubble?dm=${bob.address}&chat=full`);
    await hydrated(page);
    const mine = page.getByRole("textbox", { name: `Message ${short(bob.address)}` });
    const his = bob.page.getByRole("textbox", { name: `Message ${short(me)}` });
    await expect(mine).toBeVisible();
    await expect(his).toBeVisible();
    const text = word("hello");
    await mine.fill(text);
    await mine.press("Enter");
    await expect(lineOf(bob.page, text)).toHaveCount(1);
    return { bob, me, mine, his, text };
  }

  test("shows a reaction of his on my line, and his reply quoting it, on both pages", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    const { bob, me, his, text } = await twoAccounts({ playwright, launchOptions }, page);
    await lineOf(bob.page, text).hover();
    await lineOf(bob.page, text).getByRole("toolbar").getByRole("button", { name: "React with 👍" }).click();
    await expect(lineOf(bob.page, text).getByRole("button", { name: "👍, 1, including you" })).toBeVisible();
    await expect(lineOf(page, text).getByRole("button", { name: "👍, 1" })).toBeVisible();
    await lineOf(bob.page, text).hover();
    await lineOf(bob.page, text).getByRole("toolbar").getByRole("button", { name: "Reply" }).click();
    const answer = word("answer");
    await his.fill(answer);
    await his.press("Enter");
    await expect(lineOf(page, answer)).toContainText(`Replying to ${short(me)}: ${text}`);
  });

  test("shows my edit as the line's words on his page, marked edited, and my delete takes the line and its edit away", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    const { bob, mine, text } = await twoAccounts({ playwright, launchOptions }, page);
    await lineOf(page, text).first().hover();
    await lineOf(page, text).first().getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const fixed = word("fixed");
    await mine.fill(fixed);
    await mine.press("Enter");
    await expect(lines(bob.page).first()).toContainText(fixed);
    await expect(lines(bob.page).first()).toContainText(/Edited/);
    await expect(lines(bob.page)).toHaveCount(1);
    await lineOf(page, fixed).first().hover();
    await lineOf(page, fixed).first().getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete message?" }).getByRole("button", { name: "Delete message" }).click();
    await expect(lineOf(bob.page, fixed)).toHaveCount(0);
    await expect(lineOf(bob.page, text)).toHaveCount(0);
    await expect(lines(bob.page)).toHaveCount(0);
  });

  // Ergo may not have noticed his page gone the moment it closes, so a reaction in that window is delivered: each try is
  // taken back by the next, until Ergo refuses one (401), and the page says so with no chip left.
  test("says a reaction to an account that left, with no chip", async ({ page, playwright, launchOptions }) => {
    const { bob, text } = await twoAccounts({ playwright, launchOptions }, page);
    await bob.close();
    await expect(async () => {
      await lineOf(page, text).hover();
      await lineOf(page, text).getByRole("toolbar").getByRole("button", { name: "React with 👍" }).click();
      await expect(flash(page, "Could not react.")).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 20_000 });
    await expect(lineOf(page, text).getByRole("button", { name: /^👍, / })).toHaveCount(0);
  });
});
