import { lineOf, lines } from "./chat.ts";
import { expect, test } from "./fixtures.ts";
import { MEMBER, opened } from "./scripted.ts";
import { asAccount, barOf, GUEST, HISTORY, OTHER, ROOM, tagmsg } from "./talk.ts";

// 4d's reactions (docs/decisions.md, 2026-10-26): three quick reactions on a line's bar, a line's reactions under it as
// chips, counted once an account, an account's own pressed, sent and shown only through Ergo, whose echo says it took
// one. A scripted Ergo (scripted.ts).
test.describe("reactions", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("show under their line what Ergo replays, counted once an account, a take-back counted out, to a guest", async ({
    page,
  }) => {
    await opened(page, GUEST, {
      history: HISTORY,
      replayed: [
        tagmsg("r1", "+draft/react=👍;+reply=m1", { at: 2, who: MEMBER }),
        tagmsg("r2", "+draft/react=👍;+reply=m1", { at: 3, who: OTHER }),
        tagmsg("r3", "+draft/react=👍;+reply=m1", { at: 4, who: OTHER }),
        tagmsg("r4", "+draft/react=😂;+reply=m1", { at: 5, who: OTHER }),
        tagmsg("r5", "+draft/unreact=😂;+reply=m1", { at: 6, who: OTHER }),
        tagmsg("r6", "+draft/react=❤️;+reply=m1", { at: 7 }),
        tagmsg("r7", String.raw`+draft/react=buy\snow;+reply=m2`, { at: 8, who: OTHER }),
      ],
    });
    await expect(lines(page)).toHaveCount(2);
    await expect(lineOf(page, "the first line")).toContainText("👍 2");
    await expect(lineOf(page, "the first line")).not.toContainText("😂");
    await expect(lineOf(page, "the first line")).not.toContainText("❤️");
    await expect(lineOf(page, "the second")).not.toContainText("buy");
    await expect(lines(page).getByRole("button")).toHaveCount(0);
  });

  test("react from the bar, which Ergo's echo shows pressed under the line, and take it back from the bar", async ({
    page,
  }) => {
    const { said } = await asAccount(page);
    await lineOf(page, "the second").hover();
    await barOf(page, 1).getByRole("button", { name: "React with 👍" }).click();
    const chip = lineOf(page, "the second").getByRole("button", { name: "👍, 1, including you" });
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await lineOf(page, "the second").hover();
    const quick = barOf(page, 1).getByRole("button", { name: "React with 👍" });
    await expect(quick).toHaveAttribute("aria-pressed", "true");
    await quick.click();
    await expect(chip).toHaveCount(0);
    expect(said()).toEqual([
      `@label=r1;+draft/react=👍;+reply=m2 TAGMSG ${ROOM}`,
      `@label=r2;+draft/unreact=👍;+reply=m2 TAGMSG ${ROOM}`,
    ]);
  });

  test("take back one's own reaction from its chip, and join another's from its own", async ({ page }) => {
    const { said } = await asAccount(page, (address) => ({
      replayed: [
        tagmsg("r1", "+draft/react=🎉;+reply=m1", { at: 2, who: address }),
        tagmsg("r2", "+draft/react=🔥;+reply=m1", { at: 3, who: OTHER }),
      ],
    }));
    const line = lineOf(page, "the first line");
    await line.getByRole("button", { name: "🔥, 1" }).click();
    await expect(line.getByRole("button", { name: "🔥, 2, including you" })).toHaveAttribute("aria-pressed", "true");
    await line.getByRole("button", { name: "🎉, 1, including you" }).click();
    await expect(line.getByRole("button", { name: /🎉/ })).toHaveCount(0);
    expect(said()).toEqual([
      `@label=r1;+draft/react=🔥;+reply=m1 TAGMSG ${ROOM}`,
      `@label=r2;+draft/unreact=🎉;+reply=m1 TAGMSG ${ROOM}`,
    ]);
  });

  // R3: a chip the keyboard reaches by Tab acts on Enter and on Space, as a button does.
  test("reach a line's chip by Tab from the line, and press it with Enter, then with Space", async ({ page }) => {
    const { said } = await asAccount(page, () => ({
      replayed: [tagmsg("r1", "+draft/react=🔥;+reply=m1", { at: 2, who: OTHER })],
    }));
    await lines(page).nth(0).focus();
    await page.keyboard.press("Tab");
    await expect(lineOf(page, "the first line").getByRole("button", { name: "🔥, 1" })).toBeFocused();
    await page.keyboard.press("Enter");
    const mine = lineOf(page, "the first line").getByRole("button", { name: "🔥, 2, including you" });
    await expect(mine).toBeVisible();
    await mine.focus();
    await page.keyboard.press("Space");
    await expect(lineOf(page, "the first line").getByRole("button", { name: "🔥, 1" })).toBeVisible();
    expect(said()).toEqual([
      `@label=r1;+draft/react=🔥;+reply=m1 TAGMSG ${ROOM}`,
      `@label=r2;+draft/unreact=🔥;+reply=m1 TAGMSG ${ROOM}`,
    ]);
  });

  test("count a live reaction, and drop one Ergo's REDACT names", async ({ page }) => {
    const ergo = await opened(page, GUEST, {
      history: HISTORY,
      replayed: [tagmsg("r1", "+draft/react=👍;+reply=m1", { at: 2, who: OTHER })],
    });
    await expect(lineOf(page, "the first line")).toContainText("👍 1");
    ergo().send(tagmsg("r2", "+draft/react=👍;+reply=m1", { at: 30, who: MEMBER }));
    await expect(lineOf(page, "the first line")).toContainText("👍 2");
    ergo().send(`:gnoworld!u@h REDACT ${ROOM} r1`);
    await expect(lineOf(page, "the first line")).toContainText("👍 1");
  });

  test("offer a guest no reaction on the bar", async ({ page }) => {
    await opened(page, GUEST, { history: HISTORY });
    await lineOf(page, "the first line").hover();
    await expect(barOf(page, 0).getByRole("button")).toHaveCount(1);
    await expect(barOf(page, 0).getByRole("button", { name: "More" })).toBeVisible();
  });
});

// R10: Ergo refuses a reaction where the account may not speak; the page shows none it did not echo, and says so.
test.describe("a reaction Ergo refused", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("shows no chip and no pressed reaction, and says it could not react", async ({ page }) => {
    const { said } = await asAccount(page, () => ({ refuseReact: true }));
    await lineOf(page, "the second").hover();
    await barOf(page, 1).getByRole("button", { name: "React with 👍" }).click();
    await expect(page.getByRole("status").getByText("Could not react.", { exact: true })).toBeVisible();
    await expect(lineOf(page, "the second").getByRole("button", { name: /👍,/ })).toHaveCount(0);
    await lineOf(page, "the second").hover();
    await expect(barOf(page, 1).getByRole("button", { name: "React with 👍" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(said()).toEqual([`@label=r1;+draft/react=👍;+reply=m2 TAGMSG ${ROOM}`]);
  });
});
