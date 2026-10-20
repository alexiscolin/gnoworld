// What the stories' journeys share: the list of stories Storybook built, one story opened with its
// fonts loaded, and a token's value as the page holds it.
import { expect, type Page } from "../e2e/fixtures.ts";

interface Entry {
  id: string;
  type: string;
}

/** Every story's id, or those that start with a prefix ("compositions-"). */
export async function stories(page: Page, prefix = ""): Promise<string[]> {
  const response = await page.request.get("/index.json");
  const index = (await response.json()) as { entries: Record<string, Entry> };
  const ids = Object.values(index.entries)
    .filter((entry) => entry.type === "story")
    .map((entry) => entry.id);
  expect(ids.length).toBeGreaterThan(10);
  return ids.filter((id) => id.startsWith(prefix));
}

export async function open(page: Page, id: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await page.locator("#storybook-root > *").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/** A token's value on the open page, in pixels. */
export function token(page: Page, name: string): Promise<number> {
  return page.evaluate(
    (property) => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(property)),
    name,
  );
}
