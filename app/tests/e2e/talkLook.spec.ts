import AxeBuilder from "@axe-core/playwright";
import { inGames, lineOf, lines, word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import type { Scripted } from "./scripted.ts";
import { asAccount, barOf, field, OTHER, T, tagged, tagmsg } from "./talk.ts";

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

// Who's here holds the account's address, a new one each run (the test wallet draws its key): its width set here,
// through the element's style, which the CSP allows, so the room's width is the same each run.
const steady = (page: Page) =>
  page.getByRole("complementary", { name: "Who's here" }).evaluate((aside) => {
    aside.style.flex = "0 0 8rem";
  });
// The look's room on a computer's screen, the pointer on its first line, whose bar shows.
async function pointedFirst(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await asAccount(page, LOOK, 3);
  await steady(page);
  await lines(page).first().hover();
  await expect(barOf(page, 0)).toBeVisible();
}

test.describe("reactions, replies and edits, as they look", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("pass axe with reactions, a reply, an edit and a line's bar shown", async ({ page }) => {
    await asAccount(page, LOOK, 3);
    await lineOf(page, "count me in").hover();
    await expect(barOf(page, 2)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("look as the prototype's on a computer's screen", async ({ page }) => {
    // The first line by its place: the reply quotes its words too.
    await pointedFirst(page);
    await expect(page.getByRole("list", { name: "Messages" })).toHaveScreenshot("talk-computer.png");
  });

  // F1179 (the UX review's U7): the prototype's quote, a rule at its start and its author in bold.
  test("set a reply's quote apart by a rule at its start and its author in bold", async ({ page }) => {
    await asAccount(page, LOOK, 3);
    const quote = lineOf(page, "count me in").locator("p");
    const look = (box: typeof quote) =>
      box.evaluate((element) => {
        const rule = getComputedStyle(element);
        const who = element.querySelector("span");
        return {
          rule: parseFloat(rule.borderInlineStartWidth),
          bold: who === null ? 0 : Number(getComputedStyle(who).fontWeight),
          plain: Number(rule.fontWeight),
        };
      });
    const { rule, bold, plain } = await look(quote);
    expect(rule).toBeGreaterThan(0);
    expect(bold).toBeGreaterThan(plain);
  });

  // The green pass: the composer's reply bar pictured and checked, as the lines are.
  test("pass axe and look as the prototype's with the reply bar over the field, on a computer's screen", async ({
    page,
  }) => {
    await pointedFirst(page);
    await barOf(page, 0).getByRole("button", { name: "Reply" }).click();
    const form = page.getByRole("form", { name: "Write in #games" });
    await expect(form).toContainText("Replying to g10gh7…3y5tv: the first line");
    expect((await new AxeBuilder({ page }).include("form").analyze()).violations).toEqual([]);
    await expect(form).toHaveScreenshot("reply-bar-computer.png");
  });

  // slice-4-room-edit: the composer's edit bar over the field, on one's own line, pictured and checked as the reply bar is.
  for (const [screen, width, height] of [
    ["computer", 1280, 900],
    ["phone", 390, 844],
  ] as const)
    test(`pass axe and look as the prototype's with the edit bar over the field, on a ${screen}'s screen`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await asAccount(
        page,
        (address) => ({
          ...LOOK(address),
          history: [
            ["m1", T(0), "the first line", address],
            ["m2", T(1), "the second **line**"],
          ],
        }),
        3,
      );
      await steady(page);
      await lines(page).first().hover();
      await barOf(page, 0).getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Edit" }).click();
      const form = page.getByRole("form", { name: "Write in #games" });
      await expect(form).toContainText("Editing a message");
      await expect(field(page)).toHaveValue("the first line");
      expect((await new AxeBuilder({ page }).include("form").analyze()).violations).toEqual([]);
      await expect(form).toHaveScreenshot(`edit-bar-${screen}.png`);
    });

  // The green pass: a line's 20 chips and a quote wrap within a phone's width, nothing scrolling sideways.
  test("fit a line of 20 reactions and a reply's quote on a phone's screen, and pass axe", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const emoji = [...new Intl.Segmenter().segment("😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰😗😙🥲😚🙂")].map(
      ({ segment }) => segment,
    );
    await asAccount(
      page,
      () => ({
        replayed: [
          ...emoji.map((each, at) => tagmsg(`r${String(at)}`, `+draft/react=${each};+reply=m1`, { at: 2, who: OTHER })),
          tagged("m3", "count me in, and bring the long putter for the last hole", {
            at: 6,
            tags: "+reply=m1",
            who: OTHER,
          }),
        ],
      }),
      3,
    );
    const list = page.getByRole("list", { name: "Messages" });
    await expect(lines(page).first().getByRole("button")).toHaveCount(20);
    expect(await list.evaluate((box) => box.scrollWidth <= box.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
    await steady(page);
    await expect(list).toHaveScreenshot("talk-phone.png");
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
