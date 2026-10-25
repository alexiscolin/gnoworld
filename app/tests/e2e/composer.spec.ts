import AxeBuilder from "@axe-core/playwright";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { inGames, lineOf, messages, whoIsHere, word } from "./chat.ts";
import { logIn } from "./irc.ts";
import { scriptedErgo } from "./scripted.ts";

// The composer (slice 4's 4c) on the real server and Ergo: an account writes in #games, its line shown once Ergo
// echoes it, its Markdown as marks; a guest is told to log in. Each test logs in a wallet of its own (?as=).

const field = (page: Page) => page.getByRole("textbox", { name: "Message #games" });
const send = (page: Page) => page.getByRole("button", { name: "Send" });

test.describe("the composer", () => {
  test("sends a line with Enter, shown once Ergo echoes it, its Markdown as marks and its link https", async ({
    page,
  }) => {
    const address = await inGames(page);
    const text = word("hello");
    await field(page).fill(`${text} **bold** [docs](https://gno.land/docs)`);
    await field(page).press("Enter");
    await expect(lineOf(page, text)).toHaveCount(1);
    await expect(lineOf(page, text).getByTitle(address)).toBeVisible();
    await expect(lineOf(page, text).locator("strong")).toHaveText("bold");
    const docs = lineOf(page, text).getByRole("link", { name: "docs" });
    await expect(docs).toHaveAttribute("href", "https://gno.land/docs");
    await expect(docs).toHaveAttribute("rel", "noopener noreferrer");
    await expect(field(page)).toHaveValue("");
  });

  test("sends an action with /me, and a slash of text with //", async ({ page }) => {
    await inGames(page);
    const action = word("waves");
    await field(page).fill(`/me ${action}`);
    await send(page).click();
    await expect(lineOf(page, action)).toContainText(`* `);
    await expect(lineOf(page, action)).not.toContainText("ACTION");
    const slash = word("shrug");
    await field(page).fill(`//${slash}`);
    await field(page).press("Enter");
    await expect(lineOf(page, slash)).toContainText(new RegExp(`(^|[^/])/${slash}`));
    await expect(lineOf(page, slash)).not.toContainText(`//${slash}`);
  });

  test("wraps the selection in a mark from the format bar, the selection kept", async ({ page }) => {
    await inGames(page);
    await field(page).fill("make this bold");
    await field(page).evaluate((box: HTMLInputElement) => {
      box.setSelectionRange(10, 14);
    });
    await page.getByRole("group", { name: "Format" }).getByRole("button", { name: "Bold" }).click();
    await expect(field(page)).toHaveValue("make this **bold**");
    await page.keyboard.type("strong");
    await expect(field(page)).toHaveValue("make this **strong**");
  });

  test("sends a line of the whole budget, shown once Ergo relays it", async ({ page }) => {
    await inGames(page);
    const tag = word("max");
    const text = `${"a".repeat(419 - tag.length - 1)} ${tag}`;
    await field(page).fill(text);
    await expect(field(page)).toHaveAccessibleDescription("0 bytes left.");
    await field(page).press("Enter");
    await expect(lineOf(page, tag)).toHaveCount(1);
    await expect(field(page)).toHaveValue("");
  });

  test("says why a line cannot go, and sends nothing", async ({ page }) => {
    await inGames(page);
    await field(page).fill("/nick bob");
    await expect(field(page)).toHaveAccessibleDescription("/nick is not a command. /me sends an action.");
    await expect(send(page)).toBeDisabled();
    // An account's line holds 442 bytes: Ergo relays it under its 40-character nick, user and cloak (68 bytes).
    await field(page).fill("a".repeat(420));
    await expect(field(page)).toHaveAccessibleDescription("Too long by 1 byte.");
    await expect(send(page)).toBeDisabled();
    await field(page).press("Enter");
    await expect(
      messages(page)
        .getByRole("listitem")
        .filter({ hasText: "a".repeat(420) }),
    ).toHaveCount(0);
  });

  test("shows a hostile line it sends as text: no markup, no script run", async ({ page }) => {
    await inGames(page);
    const text = `<script>window.__xss=1</script> <img src=x onerror="window.__xss=1"> [x](javascript:window.__xss=1) ${word("hostile")}`;
    await field(page).fill(text);
    await field(page).press("Enter");
    await expect(lineOf(page, text)).toHaveCount(1);
    await expect(lineOf(page, text).locator("a, script, img")).toHaveCount(0);
    expect(await page.evaluate(() => "__xss" in window)).toBe(false);
  });

  test("tells a guest to log in to write, with no field, its page never asking the composer's code", async ({
    page,
  }) => {
    const scripts: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "script") scripts.push(request.url());
    });
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(page.getByText("Log in to write in this room.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Message/ })).toHaveCount(0);
    expect(scripts.filter((url) => /\/ChatPanel-[\w-]+\.js$/.test(url))).toHaveLength(1);
    expect(scripts.filter((url) => /\/Composer-[\w-]+\.js$/.test(url))).toEqual([]);
  });

  test("has no accessibility violation with the composer, its preview holding a link, and its hint", async ({
    page,
  }) => {
    await inGames(page);
    await field(page).fill("**see** [docs](https://gno.land/docs)");
    await expect(page.getByRole("form", { name: "Write in #games" }).getByText("docs", { exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).include("form").analyze()).violations).toEqual([]);
    await field(page).fill(`**${"a".repeat(376)}**`);
    await expect(field(page)).toHaveAccessibleDescription(/bytes left/);
    expect((await new AxeBuilder({ page }).include("form").analyze()).violations).toEqual([]);
  });

  // Ergo scripted (scripted.ts): its first socket answers, then closes; the next ones never answer.
  test("says a line was not sent while the chat is away, and keeps it", async ({ page }) => {
    const address = await logIn(page, word("as"));
    const sockets: { close: () => Promise<void> }[] = [];
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      if (sockets.length === 0) scriptedErgo(ergo, address);
      sockets.push(ergo);
    });
    await page.goto("/w/bubble?room=games");
    await hydrated(page);
    await expect(whoIsHere(page)).toContainText("2 here");
    await sockets[0]?.close();
    await field(page).fill("are you there?");
    await field(page).press("Enter");
    await expect(field(page)).toHaveAccessibleDescription(
      "Not sent: the chat is not in this room yet. Try again in a moment.",
    );
    await expect(field(page)).toHaveValue("are you there?");
  });
});
