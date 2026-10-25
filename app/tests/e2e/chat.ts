// What the chat's journeys share (slice 4): a word of a test's own, the room's lines and people, and an account of
// the test's own in #games.
import { expect, hydrated, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";

/** A word of its own for each test, so none reads another's lines, or its own retry's. */
export const word = (what: string): string => `${what}-${crypto.randomUUID().slice(0, 8)}`;
export const messages = (page: Page) => page.getByRole("list", { name: "Messages" });
export const lineOf = (page: Page, text: string) => messages(page).getByRole("listitem").filter({ hasText: text });
export const whoIsHere = (page: Page) => page.getByRole("complementary", { name: "Who's here" });

/** A test's own account, logged in, in #games, Ergo having said it is here. */
export async function inGames(page: Page): Promise<string> {
  const address = await logIn(page, word("as"));
  await page.goto("/w/bubble?room=games");
  await hydrated(page);
  await expect(whoIsHere(page).getByTitle(address)).toBeVisible();
  return address;
}
