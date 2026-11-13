import type { Page } from "./fixtures.ts";

/** Goes to a place by the search palette, where the page draws no link to it (the worlds' rail stands with the scene alone): types
 * `words`, and takes the option named `name`. */
export async function goBySearch(page: Page, words: string, name: RegExp): Promise<void> {
  await page.getByRole("button", { name: /^Search/ }).click();
  await page.getByRole("combobox", { name: "Search places" }).fill(words);
  await page.getByRole("listbox", { name: "Places" }).getByRole("option", { name }).click();
}
