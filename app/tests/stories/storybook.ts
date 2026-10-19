// What the stories' journeys share: the list of stories Storybook built, and one story opened with
// its fonts loaded.
import { expect, type Page } from "../e2e/fixtures.ts";

interface Entry {
  id: string;
  type: string;
  title: string;
}

export async function stories(page: Page): Promise<string[]> {
  const response = await page.request.get("/index.json");
  const index = (await response.json()) as { entries: Record<string, Entry> };
  const ids = Object.values(index.entries)
    .filter((entry) => entry.type === "story")
    .map((entry) => entry.id);
  expect(ids.length).toBeGreaterThan(10);
  return ids;
}

export async function open(page: Page, id: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await page.locator("#storybook-root > *").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}
