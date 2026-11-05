import AxeBuilder from "@axe-core/playwright";
import type { Locator, PlaywrightWorkerArgs, PlaywrightWorkerOptions } from "@playwright/test";
import { lineOf, whoIsHere, word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { SITE } from "./sites.ts";

// 4d's pins, through the real server and Ergo: the moderators (wallets moderator0 to 7, a worker's each, and moderator8
// for the cap's test alone, so none passes 30 requests a minute) pin a line, every reader sees it. Workers share the
// rooms and so their pins: each test looks for its own by its words.
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-5)}`;
const moderator = (name?: string) => name ?? `moderator${String(test.info().workerIndex % 8)}`;
const pinBar = (page: Page) => page.getByRole("region", { name: "Pinned messages" });
const field = (page: Page, room: string) => page.getByRole("textbox", { name: `Message #${room}` });
const barOf = (page: Page, text: string) =>
  lineOf(page, text).getByRole("toolbar", { name: "Actions on this message" });

// The pins' items, the stack opened if it is shut; the bar comes and goes with the server's answers, so a test polls for it.
const items = async (page: Page): Promise<Locator> => {
  const shut = pinBar(page).getByRole("button", { expanded: false });
  if ((await shut.count()) > 0) await shut.click();
  return pinBar(page).getByRole("listitem");
};
// How many pins hold these words (or all, with none given).
const held =
  (page: Page, text = "") =>
  async () =>
    (await items(page)).filter({ hasText: text }).count();

type Launcher = Pick<PlaywrightWorkerArgs, "playwright"> & Pick<PlaywrightWorkerOptions, "launchOptions">;
// A reader in a browser of its own: an account (named) or a guest (none), in `room`.
async function reader({ playwright, launchOptions }: Launcher, as?: string, room = "games") {
  const { baseURL } = test.info().project.use;
  if (baseURL === undefined) throw new Error("no baseURL");
  const browser = await playwright.chromium.launch(launchOptions);
  const context = await browser.newContext({ baseURL });
  const second = await context.newPage();
  const address = as === undefined ? undefined : await logIn(second, as);
  await second.goto(`/w/bubble?room=${room}&chat=full`);
  await hydrated(second);
  return { page: second, address, close: () => browser.close() };
}
// The moderator (the worker's own, or the named one) in `room`, having said `text`, which shows.
async function said(page: Page, text: string, { room = "games", as }: { room?: string; as?: string } = {}) {
  const address = await logIn(page, moderator(as));
  await page.goto(`/w/bubble?room=${room}&chat=full`);
  await hydrated(page);
  // Ergo having said the account is here: a line sent before it is lost, and the load of a full run makes that likely.
  await expect(whoIsHere(page).getByTitle(address)).toBeVisible({ timeout: 15_000 });
  await field(page, room).fill(text);
  await field(page, room).press("Enter");
  await expect(lineOf(page, text)).toBeVisible();
  return address;
}
// The pointer on the line and its Pin pressed, again if the list moved under it (a new line scrolls it).
const press = (page: Page, text: string, name: string) =>
  expect(async () => {
    await lineOf(page, text).hover();
    await barOf(page, text).getByRole("button", { name }).click({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
async function pin(page: Page, text: string) {
  await press(page, text, "Pin message");
  await expect.poll(held(page, text)).toBe(1);
}
async function unpin(page: Page, address: string, text: string) {
  const own = (await items(page)).filter({ hasText: text });
  await own.getByRole("button", { name: `Unpin ${short(address)}'s message` }).click();
  await expect.poll(held(page, text)).toBe(0);
}

test.describe("pins", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("a moderator pins a line and every reader, a guest too, sees it above the lines, the line saying Pinned", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    const text = word("pin");
    const address = await said(page, text);
    await pin(page, text);
    await expect(lineOf(page, text)).toContainText(/^\S+( you)?( new here)? ?Pinned /);
    for (const as of [undefined, word("reader")]) {
      const other = await reader({ playwright, launchOptions }, as);
      await expect.poll(held(other.page, text)).toBe(1);
      await expect(lineOf(other.page, text)).toContainText(/^\S+( you)?( new here)? ?Pinned /);
      await other.close();
    }
    await unpin(page, address, text);
    await expect(lineOf(page, text)).not.toContainText(/^\S+( you)?( new here)? ?Pinned /);
  });

  test("offers Pin to the moderator alone: a guest and another account have no button and no Unpin", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    const text = word("pin");
    const address = await said(page, text);
    await pin(page, text);
    for (const as of [undefined, word("reader")]) {
      const other = await reader({ playwright, launchOptions }, as);
      await expect.poll(held(other.page, text)).toBe(1);
      await lineOf(other.page, text).hover();
      await expect(barOf(other.page, text).getByRole("button", { name: "More actions" })).toBeVisible();
      await expect(barOf(other.page, text).getByRole("button", { name: /^(Pin|Unpin) message$/ })).toHaveCount(0);
      await expect(other.page.getByRole("button", { name: /^Unpin/ })).toHaveCount(0);
      await other.close();
    }
    await unpin(page, address, text);
  });

  test("answers the server's refusals by their codes: a guest 401, a reader 403, a line Ergo does not hold 404", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    await said(page, word("pin"));
    const post = (who: Page, body: unknown) =>
      who.request.post("/api/pins", { data: body, headers: { origin: SITE, "content-type": "application/json" } });
    const guest = await reader({ playwright, launchOptions });
    const member = await reader({ playwright, launchOptions }, word("reader"));
    const mine = { room: "#bubble/games", msgid: "no-such-line" };
    expect((await post(guest.page, mine)).status()).toBe(401);
    expect((await post(member.page, mine)).status()).toBe(403);
    expect((await post(page, mine)).status()).toBe(404);
    // The body names a line and nothing of it: the page's words are not a pin's.
    expect((await post(page, { ...mine, text: "forged" })).status()).toBe(400);
    await guest.close();
    await member.close();
  });

  test("takes a pinned line away from a reader who is connected, as its author deletes it", async ({
    page,
    playwright,
    launchOptions,
  }) => {
    const text = word("pin");
    await said(page, text);
    await pin(page, text);
    const guest = await reader({ playwright, launchOptions });
    await expect.poll(held(guest.page, text)).toBe(1);
    // The moderator's own line: deleted from its menu, asked first.
    await lineOf(page, text).hover();
    await barOf(page, text).getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete message" }).click();
    await expect(lineOf(page, text)).toHaveCount(0);
    // Ergo's REDACT reaches the guest's page, which drops the pin at once; the server's own copy goes too.
    await expect.poll(held(guest.page, text)).toBe(0);
    await guest.page.reload();
    await hydrated(guest.page);
    await expect.poll(held(guest.page, text)).toBe(0);
    await guest.close();
  });

  test("keeps the pins through a reload, a line's hostile words as text, and passes axe open", async ({ page }) => {
    const text = word("<img src=x onerror=alert(1)> [x](javascript:alert(1))");
    const address = await said(page, text);
    await pin(page, text);
    await page.reload();
    await hydrated(page);
    await expect.poll(held(page, "<img src=x onerror=alert(1)>")).toBe(1);
    await expect(pinBar(page).locator("img")).toHaveCount(0);
    await expect(pinBar(page).locator("a[href^='javascript']")).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await unpin(page, address, text);
  });

  // #news, an announcement room only its staff speak in, so no other test's pins count against its ten.
  test("keeps no more than ten pins a room: the eleventh says so, and no pin is lost", async ({ page }) => {
    const address = await said(page, word("cap"), { room: "news", as: "moderator8" });
    const texts = Array.from({ length: 11 }, (_, n) => word(`cap${String(n)}`));
    for (const text of texts) {
      await field(page, "news").fill(text);
      await field(page, "news").press("Enter");
      await expect(lineOf(page, text)).toBeVisible();
    }
    for (const text of texts.slice(0, 10)) await pin(page, text);
    const last = texts.at(-1) ?? "";
    await press(page, last, "Pin message");
    await expect(page.getByText("This room has ten pins already. Unpin one first.")).toBeVisible();
    await expect.poll(held(page)).toBe(10);
    for (const text of texts.slice(0, 10)) await unpin(page, address, text);
    await expect(pinBar(page)).toHaveCount(0);
  });

  // On a phone the pin bar is one line, the stack opens under it, and a pin's words are all there.
  test("opens on a phone from its one line to the stack, with no sideways scroll", async ({ page }) => {
    const text = word("a pinned line that is long enough to need the room it is given ".repeat(2));
    const address = await said(page, text);
    await pin(page, text);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(held(page, text)).toBe(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await unpin(page, address, text);
  });
});
