// What the chat's journeys share (slice 4): a word of a test's own, the room's lines and people, and an account of
// the test's own in #games.
import type { Locator } from "@playwright/test";
import { expect, hydrated, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";

/** A word of its own for each test, so none reads another's lines, or its own retry's. */
export const word = (what: string): string => `${what}-${crypto.randomUUID().slice(0, 8)}`;
const messages = (page: Page) => page.getByRole("list", { name: "Messages" });
/** A room's lines: the Messages list's own items, never those of a line that is a list (F814). */
export const lines = (page: Page) => messages(page).locator(":scope > li");
export const lineOf = (page: Page, text: string) => lines(page).filter({ hasText: text });
/** A line's buttons but its author's name, which opens the person's card (5a1e8335): the chips, the bar, the players. */
export const buttonsOf = (line: Locator) => line.locator("button:not([data-author] > button)");
export const whoIsHere = (page: Page) => page.getByRole("region", { name: "Who's here" });
/** The polite status that tells a screen reader a notice came: apart from the rooms' list, which a phone hides. */
export const noticeStatus = (page: Page) => page.locator('p[role="status"].visually-hidden');
export const roomsNav = (page: Page) => page.getByRole("navigation", { name: "Rooms" });

/** A test's own account, logged in, in #games, Ergo having said it is here. */
export async function inGames(page: Page): Promise<string> {
  const address = await logIn(page, word("as"));
  await page.goto("/w/bubble?room=games&chat=full");
  await hydrated(page);
  await expect(whoIsHere(page).getByTitle(address)).toBeVisible();
  return address;
}

/** The menu behind the room's name (the chevron), opened if it is not, a modal dialog: the room's note, an account's
 * notification modes and its choice of whom it hears direct messages from. Close it before the page is used again. */
export async function menu(page: Page): Promise<ReturnType<Page["locator"]>> {
  const panel = page.getByRole("dialog", { name: /^(Room|Conversation)$/ });
  if (!(await panel.isVisible())) await page.locator('[data-region="header"] button[aria-haspopup="dialog"]').click();
  await expect(panel).toBeVisible();
  return panel;
}

/** Shuts the menu if it is open (Escape), so the page behind it can be used. */
export async function closeMenu(page: Page): Promise<void> {
  const panel = page.getByRole("dialog", { name: /^(Room|Conversation)$/ });
  if (await panel.isVisible()) await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
}
