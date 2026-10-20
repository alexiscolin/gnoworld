// What the stories' journeys share: a page that may ask nothing of another host, the list of
// stories Storybook built, one story opened with its fonts loaded, and a token's length.
import { expect, test as base, type Page } from "../e2e/fixtures.ts";

export { expect };

// Every request a story's page makes, for its whole life: one to another host fails the test, as a
// component's url(), @import or image there would show each visitor's address to it.
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const site = new URL(baseURL ?? "http://unset").origin;
    const elsewhere: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol.startsWith("http") && url.origin !== site) elsewhere.push(request.url());
    });
    await use(page);
    expect(elsewhere, "requests off the site").toEqual([]);
  },
});

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
  const chosen = ids.filter((id) => id.startsWith(prefix));
  // A walk costs about a tenth of a second a story, and the stories grow with each slice: a test
  // that walks them gets a second a story on top of Playwright's 30 s.
  test.setTimeout(30_000 + chosen.length * 1_000);
  return chosen;
}

export async function open(page: Page, id: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await page.locator("#storybook-root > *").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/** A length token on the open page, in pixels, as the story's text resolves it (65ch, not 65). */
export function token(page: Page, name: string): Promise<number> {
  return page.evaluate((property) => {
    const probe = document.createElement("div");
    probe.style.inlineSize = `var(${property})`;
    document.querySelector("#storybook-root")?.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }, name);
}
