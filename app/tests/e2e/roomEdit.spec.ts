import { lineOf, lines, word } from "./chat.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { another, logIn } from "./irc.ts";
import { opened, type HistoryLine, type Scripted } from "./scripted.ts";
import { asAccount, barOf, field, GUEST, HISTORY, ROOM, T, tagged } from "./talk.ts";

// slice-4-room-edit (docs/decisions.md, 2026-10-28, F1560): a room's own lines get Edit as a direct message's do (dmBar.spec.ts):
// its words in the composer, sent tagged +gnoworld/edit with the line's msgid, shown in the line's place marked edited.
// Most journeys run on a scripted Ergo, so the bytes the page sends are read; the last runs two accounts on the real one.
const menu = (page: Page) => page.getByRole("menu", { name: "Message actions" }).getByRole("menuitem");
const editing = (page: Page) => page.getByText("Editing a message");
const flash = (page: Page, text: string) => page.getByRole("status").getByText(text, { exact: true });

// #games' history with the account's own line first (m1) and another's second (m2), the account's lines echoed.
const own = (address: string) => ({
  history: [
    ["m1", T(0), "my first words", address],
    ["m2", T(1), "their words"],
  ] satisfies HistoryLine[],
});
const asMember = (page: Page, more: (address: string) => Scripted = () => ({}), shown = 2) =>
  asAccount(page, (address) => ({ ...own(address), ...more(address) }), shown);

// `item` chosen from the More menu of the line at `at`, Edit by default.
async function choose(page: Page, at: number, item = "Edit") {
  await lines(page).nth(at).hover();
  await barOf(page, at).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}
const startEdit = (page: Page, at: number) => choose(page, at);
// The box's words replaced, and sent (Save, Enter).
async function saveAs(page: Page, words: string) {
  await field(page).fill(words);
  await field(page).press("Enter");
}
// What an edit needs of a phone's screen: the field and both buttons in view, nothing scrolling sideways.
async function fitsPhone(page: Page) {
  const shown = [
    field(page),
    page.getByRole("button", { name: "Save" }),
    page.getByRole("button", { name: "Cancel the edit" }),
  ];
  for (const target of shown) await expect(target).toBeInViewport();
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll).toBeLessThanOrEqual(client);
}

test.describe("a room's lines: Edit", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("edits one's own line: its words in the box, sent as a correction tagged with the line, shown in its place marked edited", async ({
    page,
  }) => {
    const { said } = await asMember(page);
    await startEdit(page, 0);
    await expect(editing(page)).toBeVisible();
    await expect(field(page)).toHaveValue("my first words");
    await expect(field(page)).toBeFocused();
    await saveAs(page, "my first words, fixed");
    await expect(lines(page).nth(0)).toContainText("my first words, fixed");
    await expect(lines(page).nth(0)).toContainText(/^\d{2}:\d{2} Edited /);
    await expect(lines(page)).toHaveCount(2);
    await expect(editing(page)).toHaveCount(0);
    await expect(field(page)).toHaveValue("");
    expect(said()).toEqual([`@+gnoworld/edit=m1 PRIVMSG ${ROOM} :my first words, fixed`]);
  });

  test("holds Edit between the room's link and Delete on one's own message alone", async ({ page }) => {
    await asMember(
      page,
      (address) => ({
        history: [
          ["m1", T(0), "my first words", address],
          ["m2", T(1), "their words"],
          ["m3", T(2), "\u0001ACTION waves\u0001", address],
        ],
        replayed: [tagged("e9", "a correction of mine", { at: 3, tags: "+gnoworld/edit=m9", who: address })],
      }),
      4,
    );
    await expect(lines(page)).toHaveCount(4);
    const itemsAre = async (at: number, names: string[]) => {
      await lines(page).nth(at).hover();
      await barOf(page, at).getByRole("button", { name: "More actions" }).click();
      await expect(menu(page)).toHaveText(names);
      await page.keyboard.press("Escape");
    };
    await itemsAre(0, ["Copy text", "Copy room link", "Edit", "Delete"]);
    await itemsAre(1, ["Copy text", "Copy room link"]);
    await itemsAre(2, ["Copy text", "Copy room link", "Delete"]);
    await itemsAre(3, ["Copy text", "Copy room link", "Delete"]);
  });

  test("is a guest's none: its lines have no bar to edit by", async ({ page }) => {
    await opened(page, GUEST, { history: HISTORY });
    await expect(lines(page)).toHaveCount(2);
    await lines(page).nth(0).hover();
    await expect(page.getByRole("button", { name: "More actions" })).toBeVisible();
    await page.getByRole("button", { name: "More actions" }).click();
    await expect(menu(page)).toHaveText(["Copy text", "Copy room link"]);
  });

  // The room's draft is the device's: what is typed in the edit box never reaches it, and comes back as the edit goes.
  test("leaves an edit unsent on Escape or Cancel, the draft the reader had kept, the focus in the field", async ({
    page,
  }) => {
    const { said } = await asMember(page);
    await field(page).fill("a draft in progress");
    await startEdit(page, 0);
    await expect(field(page)).toHaveValue("my first words");
    await field(page).fill("typed in the edit");
    await field(page).press("Escape");
    await expect(editing(page)).toHaveCount(0);
    await expect(field(page)).toHaveValue("a draft in progress");
    await expect(field(page)).toBeFocused();
    await startEdit(page, 0);
    await field(page).fill("typed again");
    await page.getByRole("button", { name: "Cancel the edit" }).click();
    await expect(editing(page)).toHaveCount(0);
    await expect(field(page)).toHaveValue("a draft in progress");
    await expect(field(page)).toBeFocused();
    await expect(lines(page).nth(0)).toContainText("my first words");
    await expect(lines(page).nth(0)).not.toContainText("Edited");
    expect(said()).toEqual([]);
  });

  test("gives the reader's draft back in the box once an edit is saved, and keeps it on the device through the edit", async ({
    page,
  }) => {
    const { said } = await asMember(page);
    await field(page).fill("a draft in progress");
    await startEdit(page, 0);
    await saveAs(page, "my first words, fixed");
    await expect(lines(page).nth(0)).toContainText("my first words, fixed");
    await expect(field(page)).toHaveValue("a draft in progress");
    expect(said()).toEqual([`@+gnoworld/edit=m1 PRIVMSG ${ROOM} :my first words, fixed`]);
  });

  // R7 (redpass-red): the device keeps the reader's draft, never the words of an edit, and a reload mid-edit gives the
  // draft back; the room is told the account types while an edit is typed (F1924, the decision: kept).
  test("keeps the reader's draft on the device through an edit, none of the edit's words in it, a reload giving it back", async ({
    page,
  }) => {
    const { said, typed } = await asMember(page);
    const kept = () =>
      page.evaluate(() =>
        Object.entries<string>(localStorage)
          .filter(([key]) => key.startsWith("gnoworld:draft:"))
          .map(([, value]) => value),
      );
    await field(page).fill("a draft in progress");
    await expect.poll(kept).toEqual(["a draft in progress"]);
    await startEdit(page, 0);
    await expect(field(page)).toHaveValue("my first words");
    await field(page).fill("my first words, changing");
    await expect.poll(typed).toContain(`@+typing=active TAGMSG ${ROOM}`);
    await expect.poll(kept).toEqual(["a draft in progress"]);
    await page.reload();
    await expect(lines(page)).toHaveCount(2);
    await expect(editing(page)).toHaveCount(0);
    await expect(field(page)).toHaveValue("a draft in progress");
    expect(said()).toEqual([]);
  });

  test("edits a line twice: each correction names the original line, the box starting from the last words", async ({
    page,
  }) => {
    const { said } = await asMember(page);
    await startEdit(page, 0);
    await saveAs(page, "second words");
    await expect(lines(page).nth(0)).toContainText("second words");
    await startEdit(page, 0);
    await expect(field(page)).toHaveValue("second words");
    await saveAs(page, "third words");
    await expect(lines(page).nth(0)).toContainText("third words");
    await expect(lines(page)).toHaveCount(2);
    expect(said()).toEqual([
      `@+gnoworld/edit=m1 PRIVMSG ${ROOM} :second words`,
      `@+gnoworld/edit=m1 PRIVMSG ${ROOM} :third words`,
    ]);
  });

  test("sends nothing for an edit emptied, which stays open, nor for one left as it was, which closes", async ({
    page,
  }) => {
    const { said } = await asMember(page);
    await startEdit(page, 0);
    await field(page).fill("");
    await field(page).press("Enter");
    await expect(editing(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
    await field(page).fill("my first words");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(editing(page)).toHaveCount(0);
    await expect(lines(page).nth(0)).not.toContainText("Edited");
    expect(said()).toEqual([]);
  });

  test("drops a pending reply when Edit is chosen, and ends the edit when Reply is: the next line carries one tag alone", async ({
    page,
  }) => {
    const { said } = await asMember(page);
    await lines(page).nth(1).hover();
    await barOf(page, 1).getByRole("button", { name: "Reply" }).click();
    await expect(page.getByText("Replying to", { exact: false })).toHaveCount(1);
    await startEdit(page, 0);
    await expect(page.getByText("Replying to", { exact: false })).toHaveCount(0);
    await saveAs(page, "my first words, fixed");
    await expect(lines(page).nth(0)).toContainText("my first words, fixed");
    await startEdit(page, 0);
    await lines(page).nth(1).hover();
    await barOf(page, 1).getByRole("button", { name: "Reply" }).click();
    await expect(editing(page)).toHaveCount(0);
    await expect(page.getByText("Replying to", { exact: false })).toHaveCount(1);
    await field(page).fill("an answer");
    await field(page).press("Enter");
    await expect(lineOf(page, "an answer")).toHaveCount(1);
    expect(said()).toEqual([
      `@+gnoworld/edit=m1 PRIVMSG ${ROOM} :my first words, fixed`,
      `@+reply=m2 PRIVMSG ${ROOM} :an answer`,
    ]);
  });

  // The room has no outbox: Ergo's refusal of a correction (here a numeric, unlabelled) is heard by no one, as a plain line's is
  // (F1920), so the line stays as it was and no phantom correction shows.
  test("leaves the line as it was when Ergo refuses the correction, and shows no correction", async ({ page }) => {
    const { said } = await asMember(page, () => ({ refuseTagged: true }));
    await startEdit(page, 0);
    await saveAs(page, "my first words, fixed");
    await expect.poll(() => said().length).toBe(1);
    await expect(lines(page)).toHaveCount(2);
    await expect(lines(page).nth(0)).toContainText("my first words");
    await expect(lines(page).nth(0)).not.toContainText("my first words, fixed");
    await expect(lines(page).nth(0)).not.toContainText("Edited");
  });

  // The bot checks each line, a correction included (server/src/moderation/check.ts): one it hides is REDACTed, and the line
  // shows again as it was, its Edit offered from those words.
  test("shows the line as it was when the bot hides the correction, and offers Edit again from its words", async ({
    page,
  }) => {
    const { ergo } = await asMember(page);
    await startEdit(page, 0);
    await field(page).fill("a banned word");
    await field(page).press("Enter");
    await expect(lines(page).nth(0)).toContainText("a banned word");
    ergo().send(`:gnoworld!bot@h REDACT ${ROOM} echo1 :a word this world bans`);
    await expect(lines(page).nth(0)).toContainText("my first words");
    await expect(lines(page).nth(0)).not.toContainText("Edited");
    await expect(lines(page)).toHaveCount(2);
    await startEdit(page, 0);
    await expect(field(page)).toHaveValue("my first words");
  });

  test("ends an edit, the box back to the kept draft, when its line is hidden meanwhile", async ({ page }) => {
    const { ergo } = await asMember(page);
    await field(page).fill("a draft in progress");
    await startEdit(page, 0);
    await expect(editing(page)).toBeVisible();
    ergo().send(`:gnoworld!bot@h REDACT ${ROOM} m1 :a word this world bans`);
    await expect(lines(page)).toHaveCount(1);
    await expect(editing(page)).toHaveCount(0);
    await expect(field(page)).toHaveValue("a draft in progress");
  });

  // The delete of a line is a REDACT of it; a correction is a line of its own, so each correction of mine goes with it, or the
  // deleted words stay, as the line's newest.
  test("deletes an edited line with its corrections: no line of its own is left behind", async ({ page }) => {
    await asMember(page);
    await startEdit(page, 0);
    await saveAs(page, "my first words, fixed");
    await expect(lines(page).nth(0)).toContainText("my first words, fixed");
    await choose(page, 0, "Delete");
    await page.getByRole("dialog", { name: "Delete message?" }).getByRole("button", { name: "Delete message" }).click();
    await expect(flash(page, "Message deleted.")).toBeVisible();
    await expect(lines(page)).toHaveCount(1);
    await expect(lineOf(page, "my first words")).toHaveCount(0);
  });

  test("is reached from the keyboard: the line, Tab into its bar, More, then Edit, the focus in the box", async ({
    page,
  }) => {
    await asMember(page);
    await lines(page).nth(0).focus();
    await page.keyboard.press("Tab");
    await expect(barOf(page, 0).getByRole("button").first()).toBeFocused();
    await barOf(page, 0).getByRole("button", { name: "More actions" }).focus();
    await page.keyboard.press("Enter");
    await expect(menu(page)).toHaveText(["Copy text", "Copy room link", "Edit", "Delete"]);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(editing(page)).toBeVisible();
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue("my first words");
  });

  test("keeps the bar on one row on a phone's screen, Edit behind More, and fits the edit's bar, field and buttons", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { said } = await asMember(
      page,
      (address) => ({
        history: [["m1", T(0), `a long line ${"words ".repeat(40)}end`, address]],
      }),
      1,
    );
    await lines(page).nth(0).focus();
    const bar = barOf(page, 0);
    await expect(bar.getByRole("button")).toHaveCount(3);
    expect((await bar.boundingBox())?.height ?? Infinity).toBeLessThan(56);
    await startEdit(page, 0);
    await expect(editing(page)).toBeVisible();
    await fitsPhone(page);
    expect(said()).toEqual([]);
  });
});

// Two accounts on the real Ergo, in #games: what one corrects the other sees, and cannot correct himself.
test.describe("a room's lines: Edit, between two accounts", () => {
  test("shows my edit as the line's words on his page, marked edited, with no Edit on his side", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    const bob = await another({ playwright, launchOptions }, word("bob"));
    const me = await logIn(page, word("as"));
    // Each page in the room, then each seeing the other there.
    await bob.page.goto("/w/bubble?room=games");
    await page.goto("/w/bubble?room=games");
    for (const [each, who] of [
      [bob.page, me],
      [page, bob.address],
    ] as const)
      await expect(each.getByRole("complementary", { name: "Who's here" }).getByTitle(who)).toBeVisible();
    const text = word("hello");
    await field(page).fill(text);
    await field(page).press("Enter");
    await expect(lineOf(bob.page, text)).toHaveCount(1);
    await lineOf(page, text).hover();
    await lineOf(page, text).getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const fixed = word("fixed");
    await field(page).fill(fixed);
    await field(page).press("Enter");
    await expect(lineOf(bob.page, fixed)).toContainText(/Edited/);
    await expect(lineOf(bob.page, text)).toHaveCount(0);
    await lineOf(bob.page, fixed).hover();
    await lineOf(bob.page, fixed).getByRole("button", { name: "More actions" }).click();
    await expect(bob.page.getByRole("menu", { name: "Message actions" }).getByRole("menuitem")).toHaveText([
      "Copy text",
      "Copy room link",
    ]);
    await bob.close();
  });
});
