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
  tags?: string[];
}

// Storybook's index, read once by each worker: one build serves every test. A failed read is not
// kept, and says so.
let index: Promise<Entry[]> | undefined;

function entries(page: Page): Promise<Entry[]> {
  index ??= page.request
    .get("/index.json")
    .then(async (response) => {
      if (!response.ok()) throw new Error(`Storybook's index.json answered ${String(response.status())}`);
      const read = (await response.json()) as { entries: Record<string, Entry> };
      return Object.values(read.entries).filter((entry) => entry.type === "story");
    })
    .catch((error: unknown) => {
      index = undefined;
      throw error;
    });
  return index;
}

// The ids of the stories that carry a tag, each set made once by each worker.
const byTag = new Map<string, Promise<Set<string>>>();

/** The stories with a tag: "empty" draws nothing on purpose, "viewport" sits in the top layer, and
 * Storybook's own "play-fn" acts on its story once drawn. */
export function tagged(page: Page, tag: string): Promise<Set<string>> {
  let found = byTag.get(tag);
  if (found === undefined) {
    found = entries(page).then((all) => new Set(all.filter((e) => e.tags?.includes(tag) === true).map((e) => e.id)));
    byTag.set(tag, found);
  }
  return found;
}

/** Every control with a button's look: the button, and the link that wears it. */
export const BUTTONS = "#storybook-root :is(button, a[data-emphasis])";

/** Every control of a story: what Tab reaches and a target is measured on. */
export const CONTROLS = "#storybook-root :is(button, a[href], input)";

/** The one focus ring (DESIGN-SYSTEM.md, "Focus"): style, width, colour and offset, as computed. */
export const RING = ["solid", "2px", "rgb(92, 242, 200)", "2px"];

/** Every story's id, or those that start with a prefix ("compositions-"). */
export async function stories(page: Page, prefix = ""): Promise<string[]> {
  const ids = (await entries(page)).map((entry) => entry.id);
  expect(ids.length).toBeGreaterThan(10);
  const chosen = ids.filter((id) => id.startsWith(prefix));
  // A walk costs about a tenth of a second a story, and the stories grow with each slice: a test
  // that walks them gets a second a story on top of Playwright's 30 s.
  test.setTimeout(30_000 + chosen.length * 1_000);
  return chosen;
}

/** A story, opened once it is drawn, played and its fonts loaded. An id Storybook did not build fails
 * here, where an unknown story would otherwise wait out its time drawing nothing. */
export async function open(page: Page, id: string) {
  expect(
    (await entries(page)).map((entry) => entry.id),
    "a story Storybook built",
  ).toContain(id);
  const nothing = (await tagged(page, "empty")).has(id);
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  // A story shows something, unless it draws nothing on purpose; checked each frame, as a story that
  // waits to show (a skeleton's 300 ms) would wait out a locator's slower polling.
  await page.waitForFunction((attached) => {
    const first = document.querySelector("#storybook-root > *");
    if (first === null || attached) return first !== null;
    const { width, height } = first.getBoundingClientRect();
    return width > 0 && height > 0 && first.checkVisibility({ visibilityProperty: true });
  }, nothing);
  // A story that plays is done when Storybook's render of it is (storybook 10.6's preview, read there).
  if ((await tagged(page, "play-fn")).has(id))
    await page.waitForFunction(() => {
      const preview: unknown = Reflect.get(window, "__STORYBOOK_PREVIEW__");
      const render: unknown = preview instanceof Object ? Reflect.get(preview, "currentRender") : undefined;
      return render instanceof Object && Reflect.get(render, "phase") === "finished";
    });
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
