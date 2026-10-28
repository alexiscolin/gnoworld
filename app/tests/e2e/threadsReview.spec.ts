import { lineOf, lines, roomsNav } from "./chat.ts";
import { live, marks } from "./scriptedRoom.ts";
import { expect, test, type Page } from "./fixtures.ts";
import type { HistoryLine } from "./scripted.ts";
import { asAccount, ROOM, T, tagged } from "./talk.ts";
import { chipOf, closeButton, inThread, panel, say, threadField, threadOf } from "./thread.ts";

// What the code review of 4d's threads found (docs/review/findings.md, F1760 on): each journey fails without its fix.
test.describe("threads, from the review", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  // CR9 (F1760): the panel reads its root from the room's lines each time it draws, not once at the click.
  test("follows a chain that grows while its panel is open: the root it now has, and its tag", async ({ page }) => {
    const history: HistoryLine[] = [["m1", T(0), "the first root"]];
    const { ergo, said } = await asAccount(
      page,
      () => ({ history, replayed: [tagged("m3", "the late reply", { at: 3, tags: "+reply=m2" })] }),
      2,
    );
    await threadOf(lineOf(page, "the late reply"));
    await expect(panel(page)).toContainText(/earlier message/i);
    await expect(inThread(page)).toHaveText([/the late reply/]);
    // The line it answers comes, itself an answer to the first: one thread now, rooted in the first.
    ergo().send(tagged("m2", "the middle", { at: 2, tags: "+reply=m1" }));
    await expect(lines(page)).toHaveCount(3);
    await expect(inThread(page)).toHaveText([/the first root/, /the middle/, /the late reply/]);
    await expect(panel(page)).toContainText("2 replies");
    await say(page, "to the root");
    await expect(inThread(page)).toHaveCount(4);
    expect(said()).toEqual([`@+reply=m1 PRIVMSG ${ROOM} :to the root`]);
    await closeButton(page).click();
  });

  // CR1 (F1761): words typed in a thread are not lost to an Escape, another thread or a room; kept in the page's memory.
  test("keeps the words typed in a thread through Escape, another thread and a room, till they are sent", async ({
    page,
  }) => {
    const history: HistoryLine[] = [
      ["m1", T(0), "the root line"],
      ["m2", T(1), "an unrelated line"],
    ];
    const { said } = await asAccount(
      page,
      () => ({ history, replayed: [tagged("m3", "a reply", { at: 2, tags: "+reply=m1" })] }),
      3,
    );
    await chipOf(lines(page).first()).click();
    await threadField(page).fill("half a thought");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await chipOf(lines(page).first()).click();
    await expect(threadField(page)).toHaveValue("half a thought");
    // Another thread has its own field; this one's words wait.
    await threadOf(lineOf(page, "an unrelated line"));
    await expect(threadField(page)).toHaveValue("");
    await threadField(page).fill("for the other");
    await chipOf(lines(page).first()).click();
    await expect(threadField(page)).toHaveValue("half a thought");
    await roomsNav(page).getByRole("link", { name: "#bubble" }).click();
    await expect(panel(page)).toHaveCount(0);
    await roomsNav(page).getByRole("link", { name: "#games" }).click();
    await chipOf(lines(page).first()).click();
    await expect(threadField(page)).toHaveValue("half a thought");
    // Memory only: no draft of the panel's is on the device.
    const kept = await page.evaluate(() => JSON.stringify(localStorage));
    expect(kept).not.toContain("half a thought");
    expect(kept).not.toContain("for the other");
    await say(page, "half a thought");
    await expect(inThread(page)).toHaveCount(3);
    expect(said()).toEqual([`@+reply=m1 PRIVMSG ${ROOM} :half a thought`]);
    await closeButton(page).click();
    await chipOf(lines(page).first()).click();
    await expect(threadField(page)).toHaveValue("");
  });

  // R7: on a screen that shows both, the list beside the open panel is seen at its end: a live line is marked read.
  test("marks a line read that comes while the panel is open beside a list that shows its end", async ({ page }) => {
    const heard: string[] = [];
    const { ergo } = await asAccount(
      page,
      () => ({
        history: [["m1", T(0), "the root line"]],
        replayed: [tagged("m2", "an answer", { at: 1, tags: "+reply=m1" })],
        read: T(1),
        heard: (line) => heard.push(line),
      }),
      2,
    );
    await chipOf(lines(page).first()).click();
    await expect(lines(page).first()).toBeVisible();
    ergo().send(live("m99", T(45), { text: "seen" }));
    await expect(lineOf(page, "seen")).toBeVisible();
    await expect.poll(() => marks(heard).join()).toContain(T(45));
  });

  // On a phone the open panel hides the room's list (display: none), the composer with it.
  test.describe("on a phone's screen", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    // Forty lines, the last a reply to the first: the list scrolls, and the thread is opened from the reply's menu.
    const forty: HistoryLine[] = Array.from({ length: 40 }, (_, n) => [`m${String(n)}`, T(n), `line ${String(n)}`]);
    const reply = tagged("r1", "the reply", { at: 41, tags: "+reply=m0" });
    const atEnd = (page: Page) =>
      lines(page)
        .first()
        .evaluate((item) => {
          const list = item.parentElement;
          return list !== null && list.scrollHeight - list.scrollTop - list.clientHeight < 32;
        });

    // The reader at the end of forty lines, read to the reply, then the panel opened: the list hidden.
    const hiddenByPanel = async (page: Page) => {
      const heard: string[] = [];
      const { ergo } = await asAccount(
        page,
        () => ({ history: forty, replayed: [reply], read: T(41), heard: (line) => heard.push(line) }),
        41,
      );
      await threadOf(lineOf(page, "the reply"));
      return { heard, ergo };
    };

    // CR2 (F1762): a line that comes while the list is hidden is not one the reader saw: no reading place moves.
    test("marks no line read that comes while the panel hides the list", async ({ page }) => {
      const { heard, ergo } = await hiddenByPanel(page);
      await expect(panel(page)).toBeVisible();
      await expect(lines(page).first()).toBeHidden();
      ergo().send(live("m99", T(45), { text: "unseen" }));
      // The panel's own word goes out behind everything the page sent before it, on the same socket.
      await say(page, "barrier");
      await expect.poll(() => heard.some((line) => line.includes(":barrier"))).toBe(true);
      expect(marks(heard).join()).not.toContain(T(45));
    });

    // R7: what is hidden is read once it is shown at its end again: the line that came meanwhile is marked at Close.
    test("marks the line that came while the panel hid the list once the panel is closed", async ({ page }) => {
      const { heard, ergo } = await hiddenByPanel(page);
      await expect(lines(page).first()).toBeHidden();
      ergo().send(live("m99", T(45), { text: "unseen" }));
      await closeButton(page).click();
      await expect(lines(page).first()).toBeVisible();
      await expect.poll(() => marks(heard).join()).toContain(T(45));
    });

    // CR2: the list comes back at the end it was left at, the reader being there when the panel opened.
    test("gives the list back at its end after a panel opened and closed", async ({ page }) => {
      await asAccount(page, () => ({ history: forty, replayed: [reply] }), 41);
      await expect.poll(() => atEnd(page)).toBe(true);
      await threadOf(lineOf(page, "the reply"));
      await expect(lines(page).first()).toBeHidden();
      await closeButton(page).click();
      await expect(lines(page).first()).toBeVisible();
      await expect.poll(() => atEnd(page)).toBe(true);
    });
  });

  // CR3 (F1763): the panel's code is a lazy chunk. A chunk that cannot be fetched is the panel's failure alone, and the
  // next thread opened asks for it again; one that is slow shows a panel with its Close, which a phone needs, as the
  // room is hidden meanwhile.
  test.describe("the panel's code", () => {
    test.use({ serviceWorkers: "block" });
    const chunk = /\/assets\/ThreadBody-[\w-]+\.js$/;
    const base: HistoryLine[] = [["m1", T(0), "the root line"]];
    const answer = tagged("m2", "an answer", { at: 1, tags: "+reply=m1" });

    test("says it could not open the thread when its code cannot be fetched, the room standing, and asks again", async ({
      page,
    }) => {
      let fetched = 0;
      let failing = true;
      await page.route(chunk, (route) => {
        fetched += 1;
        return failing ? route.abort() : route.continue();
      });
      await asAccount(page, () => ({ history: base, replayed: [answer] }), 2);
      await chipOf(lines(page).first()).click();
      await expect(panel(page)).toContainText("Could not open the thread");
      await expect(page.getByText("could not load")).toHaveCount(0);
      await expect(lines(page)).toHaveCount(2);
      await closeButton(page).click();
      await expect(panel(page)).toHaveCount(0);
      failing = false;
      await chipOf(lines(page).first()).click();
      await expect(inThread(page)).toHaveText([/the root line/, /an answer/]);
      expect(fetched).toBe(2);
    });

    test.describe("on a phone's screen", () => {
      test.use({ viewport: { width: 390, height: 844 } });
      test("shows a Close while its code comes, which gives the room back", async ({ page }) => {
        let release: () => void = () => undefined;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.route(chunk, async (route) => {
          await held;
          await route.continue();
        });
        await asAccount(page, () => ({ history: base, replayed: [answer] }), 2);
        await lines(page).first().hover();
        await chipOf(lines(page).first()).click();
        await expect(lines(page).first()).toBeHidden();
        await expect(closeButton(page)).toBeVisible();
        await closeButton(page).click();
        await expect(lines(page).first()).toBeVisible();
        release();
        await expect(panel(page)).toHaveCount(0);
      });
    });
  });
});
