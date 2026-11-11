import type { Page } from "./fixtures.ts";

export const calls = (page: Page) => page.getByRole("region", { name: "Write functions" });

/** Try it's Write tab, as a person opens it: the list is drawn, held hidden, until the tab is chosen. */
export async function writeTab(page: Page): Promise<void> {
  await page.getByRole("tab", { name: /^Write/ }).click();
}

/** A write's row, opened in place (its body is inert while it is shut). */
export async function openRow(page: Page, name: string) {
  const row = calls(page).getByRole("button", { name: new RegExp(`^${name}\\(`) });
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
  return row;
}

/** The person's two steps to a call card: the row, then its "Call X" button (`tap` on a phone). */
export async function openCall(page: Page, name: string, how: "click" | "tap" = "click"): Promise<void> {
  await openRow(page, name);
  const call = calls(page).getByRole("button", { name: `Call ${name}` });
  await (how === "tap" ? call.tap() : call.click());
}
