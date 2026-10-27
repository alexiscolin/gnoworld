// What the thread journeys share (slice 4's 4d threads): the panel beside the room, its lines and its field, a line's
// chip, and the Open thread item of a line's More menu.
import type { Locator } from "@playwright/test";
import type { Page } from "./fixtures.ts";

export const panel = (page: Page) => page.getByRole("complementary", { name: "Thread" });
export const inThread = (page: Page) =>
  panel(page).getByRole("list", { name: "In this thread" }).locator(":scope > li");
export const threadField = (page: Page) => panel(page).getByRole("textbox", { name: "Message this thread" });
export const chipOf = (line: Locator) => line.getByRole("button", { name: /^\d+ repl(y|ies)\b/ });
export const closeButton = (page: Page) => panel(page).getByRole("button", { name: "Close the thread" });
// The Open thread item of a line's More menu (docs/decisions.md, 2026-10-27), the bar showing while the line is pointed at.
export async function threadOf(line: Locator) {
  await line.hover();
  await line.getByRole("toolbar").getByRole("button", { name: "More actions", exact: true }).click();
  await line.page().getByRole("menuitem", { name: "Open thread" }).click();
}
