import type { Route } from "@playwright/test";
import { accountPill } from "./account.ts";
import { inGames, lines, word } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";

// Jarvis end to end on the real server and Ergo, its two routes (/api/jarvis/state, /api/jarvis/ask) stubbed: the three ways in (the
// account menu, the composer's + menu, a line that starts with `@jarvis `), the answer card, the error line, the off state and the guest's
// card. The room never hears an ask.
const json =
  (body: unknown, status = 200) =>
  (route: Route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const state = (page: Page, on: boolean) => page.route("**/api/jarvis/state", json({ on }));
const ROOM = "#bubble/games";
const field = (page: Page) => page.getByRole("textbox", { name: "Message #games" });
const intro = (page: Page) => page.locator("[data-jarvis]").filter({ hasText: "AI concierge" });
const cards = (page: Page) => page.locator("[data-jarvis]");
// What the room heard: its lines, Jarvis's cards (list items of the same list) apart.
const heard = (page: Page) => lines(page).and(page.locator(":not([data-jarvis])"));

/** Answers every ask with `answer` (or a 500), recording the bodies the page sent. */
async function answering(page: Page, answer: unknown, status = 200): Promise<unknown[]> {
  const asked: unknown[] = [];
  await page.route("**/api/jarvis/ask", async (route) => {
    asked.push(route.request().postDataJSON());
    await json(answer, status)(route);
  });
  return asked;
}

const ANSWER = { status: "answered", markdown: "Vote **YES** before it closes.", buttons: [] };

test.describe("Jarvis", () => {
  test("opens from the account menu, answers a fixed ask, and the room hears none of it", async ({ page }) => {
    await state(page, true);
    const asked = await answering(page, ANSWER);
    await inGames(page);
    await accountPill(page).click();
    await page.getByRole("menuitem", { name: "Jarvis" }).click();
    await expect(intro(page)).toBeVisible();
    await expect(intro(page)).toContainText("Its answers are yours alone");
    await intro(page).getByRole("button", { name: "What can I do here?" }).click();
    await expect(cards(page).filter({ hasText: "Vote YES before it closes." })).toBeVisible();
    expect(asked).toEqual([{ ask: "here", room: ROOM }]);
    await expect(heard(page).filter({ hasText: "Vote YES" })).toHaveCount(0);
  });

  test("opens from the composer's + menu, and Catch up asks at once", async ({ page }) => {
    await state(page, true);
    const asked = await answering(page, ANSWER);
    await inGames(page);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: "Jarvis" }).click();
    await expect(intro(page)).toBeVisible();
    await intro(page).getByRole("button", { name: "Catch up" }).click();
    await expect.poll(() => asked).toEqual([{ ask: "catch-up", room: ROOM }]);
    await expect(cards(page).filter({ hasText: "Vote YES before it closes." })).toBeVisible();
  });

  test("takes a line that starts with @jarvis as a question, not as a message to the room", async ({ page }) => {
    await state(page, true);
    const asked = await answering(page, ANSWER);
    await inGames(page);
    const question = word("what is a realm");
    await page.getByRole("button", { name: "Ask Jarvis" }).click();
    await expect(field(page)).toContainText("@jarvis");
    await field(page).pressSequentially(question);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(cards(page).filter({ hasText: "Vote YES before it closes." })).toBeVisible();
    expect(asked).toEqual([{ question, room: ROOM }]);
    await expect(heard(page).filter({ hasText: question })).toHaveCount(0);
  });

  test("says one plain line when the answer fails, and when Jarvis declines", async ({ page }) => {
    await state(page, true);
    await answering(page, { error: "boom" }, 500);
    await inGames(page);
    await accountPill(page).click();
    await page.getByRole("menuitem", { name: "Jarvis" }).click();
    await intro(page).getByRole("button", { name: "Catch up" }).click();
    await expect(page.locator("[data-jarvis-line]")).toHaveText("Jarvis could not answer: try again later.");
    await expect(page.getByRole("button", { name: "Search a place" })).toBeVisible();

    await page.unroute("**/api/jarvis/ask");
    await answering(page, { status: "declined" });
    await intro(page).getByRole("button", { name: "What can I do here?" }).click();
    await expect(page.locator("[data-jarvis-line]").last()).toHaveText(
      "Jarvis only answers about gno.land, gnoworld and this place.",
    );
  });

  test("is greyed, coming soon, while Jarvis is off, and the composer's Ask Jarvis is greyed with its reason", async ({
    page,
  }) => {
    await state(page, false);
    await inGames(page);
    await expect(page.getByRole("button", { name: "Ask Jarvis", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ask Jarvis: Jarvis is off for now" })).toBeVisible();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const item = page.getByRole("menuitem", { name: /^Jarvis/ });
    await expect(item).toHaveAttribute("aria-disabled", "true");
    await expect(item).toHaveAttribute("aria-label", "Jarvis, coming soon");
    await page.keyboard.press("Escape");
    await accountPill(page).click();
    const own = page.getByRole("menuitem", { name: /^Jarvis/ });
    await expect(own).toHaveAttribute("aria-disabled", "true");
    await expect(own).toHaveAttribute("aria-label", "Jarvis, coming soon");
  });

  test("is greyed with its reason when the state route is down", async ({ page }) => {
    await page.route("**/api/jarvis/state", json({ error: "down" }, 500));
    await inGames(page);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /^Jarvis/ })).toHaveAttribute("aria-disabled", "true");
  });

  test("offers a guest no way in, and asks nothing", async ({ page }) => {
    await state(page, true);
    const asked = await answering(page, ANSWER);
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    await expect(page.getByRole("form", { name: /as a guest$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask Jarvis" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
    await expect(cards(page)).toHaveCount(0);
    expect(asked).toEqual([]);
  });
});
