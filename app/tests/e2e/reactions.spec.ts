import { lineOf, lines, word } from "./chat.ts";
import { expect, hydrated, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { MEMBER, opened, scriptedErgo, type HistoryLine } from "./scripted.ts";
import { asAccount, barOf, GUEST, HISTORY, OTHER, ROOM, T, tabsTo, tagmsg } from "./talk.ts";

// The lines sent, each label as a star: what a label says is the link's own (F1170).
const unlabelled = (sent: readonly string[]) => sent.map((line) => line.replace(/^@label=[^;]+;/u, "@label=*;"));

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
    expect(unlabelled(said())).toEqual([
      `@label=*;+draft/react=👍;+reply=m2 TAGMSG ${ROOM}`,
      `@label=*;+draft/unreact=👍;+reply=m2 TAGMSG ${ROOM}`,
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
    expect(unlabelled(said())).toEqual([
      `@label=*;+draft/react=🔥;+reply=m1 TAGMSG ${ROOM}`,
      `@label=*;+draft/unreact=🎉;+reply=m1 TAGMSG ${ROOM}`,
    ]);
  });

  // The green pass (G1): mine stays pressed, on the chip and on the bar, when another account reacts after me.
  // The code review (CR4): taking back the last of an emoji from its chip, which goes, hands the focus to its line.
  test("hand the focus to the line when its chip goes with the reaction taken back", async ({ page }) => {
    await asAccount(page, (address) => ({
      replayed: [tagmsg("r1", "+draft/react=🎉;+reply=m1", { at: 2, who: address })],
    }));
    const line = lineOf(page, "the first line");
    await line.getByRole("button", { name: "🎉, 1, including you" }).focus();
    await page.keyboard.press("Enter");
    await expect(line.getByRole("button", { name: /🎉/ })).toHaveCount(0);
    await expect(lines(page).nth(0)).toBeFocused();
  });

  // The code review (CR3): a reaction that grows the newest line, read at the end, keeps the list at its end.
  test("keep the list at its end as a reaction grows the newest line", async ({ page }) => {
    const history = Array.from({ length: 40 }, (_, n): HistoryLine => [`h${String(n)}`, T(n), `line ${String(n)}`]);
    const { ergo } = await asAccount(page, () => ({ history }), 40);
    const list = page.getByRole("list", { name: "Messages" });
    const left = () => list.evaluate((box) => box.scrollHeight - box.scrollTop - box.clientHeight);
    await expect.poll(left).toBeLessThan(2);
    ergo().send(tagmsg("r1", "+draft/react=👍;+reply=h39", { at: 50, who: OTHER }));
    await expect(lines(page).nth(39).getByRole("button", { name: "👍, 1" })).toBeVisible();
    await expect.poll(left).toBeLessThan(2);
  });

  test("keep one's reaction pressed, on its chip and its quick reaction, when another account's comes after it", async ({
    page,
  }) => {
    await asAccount(page, (address) => ({
      replayed: [
        tagmsg("r1", "+draft/react=👍;+reply=m1", { at: 2, who: address }),
        tagmsg("r2", "+draft/react=👍;+reply=m1", { at: 3, who: OTHER }),
      ],
    }));
    const line = lineOf(page, "the first line");
    await expect(line.getByRole("button", { name: "👍, 2, including you" })).toHaveAttribute("aria-pressed", "true");
    await line.hover();
    await expect(barOf(page, 0).getByRole("button", { name: "React with 👍" })).toHaveAttribute("aria-pressed", "true");
  });

  // The green pass (G4): a reaction that cannot go out, the chat away, is said at once and sends nothing. Ergo
  // scripted: its first socket answers, then closes; the next ones never answer.
  test("say a reaction could not go while the chat is away, and send nothing", async ({ page }) => {
    const address = await logIn(page, word("talk"));
    const sent: string[] = [];
    const sockets: { close: () => Promise<void> }[] = [];
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      if (sockets.length === 0) scriptedErgo(ergo, address, { history: HISTORY, heard: (line) => sent.push(line) });
      sockets.push(ergo);
    });
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(lines(page)).toHaveCount(2);
    await sockets[0]?.close();
    await lineOf(page, "the second").hover();
    await barOf(page, 1).getByRole("button", { name: "React with 👍" }).click();
    await expect(page.getByRole("status").getByText("Could not react.", { exact: true })).toBeVisible();
    expect(sent.filter((line) => line.includes(" TAGMSG "))).toEqual([]);
  });

  // R3: a chip the keyboard reaches by Tab acts on Enter and on Space, as a button does.
  test("reach a line's chip by Tab from the line, and press it with Enter, then with Space", async ({ page }) => {
    const { said } = await asAccount(page, () => ({
      replayed: [tagmsg("r1", "+draft/react=🔥;+reply=m1", { at: 2, who: OTHER })],
    }));
    await lines(page).nth(0).focus();
    await tabsTo(page, lineOf(page, "the first line").getByRole("button", { name: "🔥, 1" }), 8);
    await page.keyboard.press("Enter");
    const mine = lineOf(page, "the first line").getByRole("button", { name: "🔥, 2, including you" });
    await expect(mine).toBeVisible();
    await mine.focus();
    await page.keyboard.press("Space");
    await expect(lineOf(page, "the first line").getByRole("button", { name: "🔥, 1" })).toBeVisible();
    expect(unlabelled(said())).toEqual([
      `@label=*;+draft/react=🔥;+reply=m1 TAGMSG ${ROOM}`,
      `@label=*;+draft/unreact=🔥;+reply=m1 TAGMSG ${ROOM}`,
    ]);
  });

  // F1171 (the UX review's U2): the bar stands before the chips in the Tab order, so Reply is 4 presses from the line
  // whatever the line holds, and the chips follow More.
  test("reach a line's bar by Tab before its 20 chips, then the chips", async ({ page }) => {
    const emoji = [...new Intl.Segmenter().segment("😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰😗😙🥲😚🙂")].map(
      ({ segment }) => segment,
    );
    await asAccount(page, () => ({
      replayed: emoji.map((each, at) =>
        tagmsg(`r${String(at)}`, `+draft/react=${each};+reply=m1`, { at: 2, who: OTHER }),
      ),
    }));
    const line = lineOf(page, "the first line");
    await expect(line.getByRole("button")).toHaveCount(20);
    await line.focus();
    expect(await tabsTo(page, barOf(page, 0).getByRole("button", { name: "Reply" }), 24)).toBe(4);
    expect(await tabsTo(page, line.getByRole("button", { name: "😀, 1" }), 3)).toBe(2);
  });

  // F1172 (U9): the chips are a group named for what they are.
  test("name a line's chips as a group, Reactions, to a guest and to an account", async ({ page }) => {
    const replayed = [tagmsg("r1", "+draft/react=🔥;+reply=m1", { at: 2, who: OTHER })];
    await opened(page, GUEST, { history: HISTORY, replayed });
    const group = lineOf(page, "the first line").getByRole("group", { name: "Reactions" });
    await expect(group).toContainText("🔥 1");
    await expect(lineOf(page, "the second").getByRole("group", { name: "Reactions" })).toHaveCount(0);
  });

  test("name an account's chips as a group, Reactions", async ({ page }) => {
    await asAccount(page, () => ({ replayed: [tagmsg("r1", "+draft/react=🔥;+reply=m1", { at: 2, who: OTHER })] }));
    const group = lineOf(page, "the first line").getByRole("group", { name: "Reactions" });
    await expect(group.getByRole("button", { name: "🔥, 1" })).toBeVisible();
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
    expect(unlabelled(said())).toEqual([`@label=*;+draft/react=👍;+reply=m2 TAGMSG ${ROOM}`]);
  });
});
