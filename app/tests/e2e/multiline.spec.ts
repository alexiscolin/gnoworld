import AxeBuilder from "@axe-core/playwright";
import { inGames, lineOf, lines, word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { scriptedErgo, type HistoryLine } from "./scripted.ts";

// A message of several lines (docs/decisions.md row 255, by Alexis: draft/multiline, Shift+Enter adds a line): the
// composer's box holds lines and Enter sends them as one batch; a message of several lines shows as one line, its
// Markdown's blocks drawn. On a scripted Ergo that answers as Ergo 2.19.1 does, then on the real Ergo.
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
const field = (page: Page) => page.getByRole("textbox", { name: "Message #games" });

// #games on the scripted Ergo as the test's account, its history `history`; what the page sends, as it sends it.
async function opened(
  page: Page,
  history: readonly HistoryLine[] = [["a1", T(0), "the first line"]],
  noMultiline = false,
) {
  const address = await logIn(page, word("lines"));
  const sent: string[] = [];
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, address, { history, noMultiline, heard: (line) => sent.push(line) });
  });
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  await expect(lines(page)).toHaveCount(history.length);
  return sent;
}

test.describe("a message of several lines", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("adds a line with Shift+Enter, and sends the draft whole with Enter, as one draft/multiline batch", async ({
    page,
  }) => {
    const sent = await opened(page);
    await field(page).click();
    await page.keyboard.type("- one");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("- two");
    await expect(field(page)).toHaveValue("- one\n- two");
    await page.keyboard.press("Enter");
    await expect(field(page)).toHaveValue("");
    const batch = sent.filter((line) => /^(@batch=\S+ )?(BATCH|PRIVMSG) /.test(line));
    const ref = /^BATCH \+(\S+) draft\/multiline #bubble\/games$/.exec(batch[0] ?? "")?.[1] ?? "?";
    expect(batch).toEqual([
      `BATCH +${ref} draft/multiline #bubble/games`,
      `@batch=${ref} PRIVMSG #bubble/games :- one`,
      `@batch=${ref} PRIVMSG #bubble/games :- two`,
      `BATCH -${ref}`,
    ]);
    // Ergo's echo: one line, its list of two items.
    await expect(lines(page)).toHaveCount(2);
    await expect(lines(page).last().locator("ul > li")).toHaveText(["one", "two"]);
  });

  test("shows a message of several lines from the room's history as one line, a quote and a list drawn", async ({
    page,
  }) => {
    await opened(page, [
      ["a1", T(0), "the first line"],
      ["m2", T(1), "> what was asked\n- one\n- two"],
    ]);
    const line = lineOf(page, "what was asked");
    await expect(line).toHaveCount(1);
    await expect(line.locator("blockquote")).toHaveText("what was asked");
    await expect(line.locator("ul > li")).toHaveText(["one", "two"]);
  });

  test("says a message one line past its cap, and sends nothing on Enter", async ({ page }) => {
    const sent = await opened(page);
    await field(page).fill(Array.from({ length: 41 }, (_, at) => `line ${String(at)}`).join("\n"));
    await expect(page.getByText("1 line too many: 40 at most.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
    await field(page).press("Enter");
    expect(sent.filter((line) => line.startsWith("BATCH ") || line.includes(" PRIVMSG "))).toEqual([]);
    // Enter says nothing more: the reason stays the cap's, not a "Not sent" of the link's (G9).
    await expect(field(page)).toHaveAccessibleDescription("1 line too many: 40 at most.");
  });

  // A phone cannot log in (backlog row 4: a coarse pointer gets no login button), so the page is logged in on a
  // computer, then switched to touch emulation; the composer follows the pointer media query as it changes.
  test("on a touch screen, Enter adds a line and Send sends the draft whole (F1714)", async ({ page }) => {
    const sent = await opened(page);
    await expect(page.getByText("Shift+Enter adds a line.")).toBeVisible();
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await expect(page.getByText("Enter adds a line; Send sends it.")).toBeVisible();
    await field(page).click();
    await page.keyboard.type("- one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- two");
    await expect(field(page)).toHaveValue("- one\n- two");
    expect(sent.filter((line) => line.startsWith("BATCH "))).toEqual([]);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(field(page)).toHaveValue("");
    expect(sent.filter((line) => line.startsWith("BATCH +"))).toHaveLength(1);
  });

  test("to an Ergo without draft/multiline, sends up to 20 lines one at a time and refuses a 21st (F1719)", async ({
    page,
  }) => {
    const sent = await opened(page, undefined, true);
    const lines20 = Array.from({ length: 20 }, (_, at) => `line ${String(at)}`);
    await field(page).fill([...lines20, "line 20"].join("\n"));
    const why = "1 line too many: 20 at most, as this chat sends one line at a time.";
    await expect(page.getByText(why, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
    await field(page).press("Enter");
    expect(sent.filter((line) => line.includes("PRIVMSG "))).toEqual([]);
    await field(page).fill(lines20.join("\n"));
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
    await field(page).press("Enter");
    await expect(field(page)).toHaveValue("");
    expect(sent.filter((line) => line.startsWith("BATCH +"))).toEqual([]);
    expect(sent.filter((line) => /PRIVMSG #bubble\/games :line \d+$/.test(line))).toHaveLength(20);
  });

  // F1722 (CR10): a box of two rows showed two lines of a 30-line paste, and a sideways drag could push Send off a
  // 320 px screen. It grows with its draft up to ten lines, then scrolls, and no drag makes it wider than its place.
  test("grows with its draft up to ten lines, and keeps Send in view on a 320 px screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await opened(page);
    const height = () => field(page).evaluate((box) => box.getBoundingClientRect().height);
    const empty = await height();
    await field(page).fill(Array.from({ length: 6 }, (_, at) => `line ${String(at)}`).join("\n"));
    const six = await height();
    expect(six).toBeGreaterThan(empty + 40);
    await field(page).fill(Array.from({ length: 60 }, (_, at) => `line ${String(at)}`).join("\n"));
    expect(await height()).toBeGreaterThan(six);
    expect(await height()).toBeLessThan(350);
    expect(await field(page).evaluate((box) => box.scrollHeight > box.clientHeight)).toBe(true);
    // What a drag of the handle sets on the box: a width far past its place.
    await field(page).evaluate((box) => {
      box.style.width = "2000px";
    });
    const send = await page.getByRole("button", { name: "Send" }).boundingBox();
    expect((send?.x ?? 999) + (send?.width ?? 999)).toBeLessThanOrEqual(320);
  });

  test("passes axe with a draft of several lines and a message of several lines shown", async ({ page }) => {
    await opened(page, [["m1", T(0), "- one\n- two"]]);
    await field(page).fill("first\nsecond");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

// Through the real Ergo, whose template turns draft/multiline on: the message relayed, echoed and kept as one.
test("sends a message of several lines through Ergo, one line after a reload too", async ({ page }) => {
  await inGames(page);
  const text = word("several");
  await field(page).fill(`${text}\n- one\n- two`);
  await field(page).press("Enter");
  await expect(lineOf(page, text)).toHaveCount(1);
  await expect(lineOf(page, text).locator("ul > li")).toHaveText(["one", "two"]);
  await page.reload();
  await hydrated(page);
  await expect(lineOf(page, text)).toHaveCount(1);
  await expect(lineOf(page, text).locator("ul > li")).toHaveText(["one", "two"]);
});
