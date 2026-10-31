import AxeBuilder from "@axe-core/playwright";
import { controlled, expect, hydrated, test, type Page } from "./fixtures.ts";
import { adena } from "./adena.ts";
import { logIn } from "./irc.ts";
import { UPDATING } from "./sites.ts";

// The page's shell (slice 5's 5a: U5, F355): a 16 px gutter on every page, the home link, the account and Log out on
// one header row, and an update notice that covers nothing the keyboard reaches.
const GUTTER = 16;
const WIDTHS = [390, 1280] as const;
const PAGES = ["/", "/w/bubble", "/nowhere"];

// Every visible word (a text node's lines, one box each) and every visible control, as a box's top, left and right edge.
const edgesOf = (page: Page) =>
  page.evaluate(() => {
    const found: { what: string; top: number; left: number; right: number }[] = [];
    const take = (what: string, rect: DOMRect) => {
      if (rect.width > 0 && rect.height > 0) found.push({ what, top: rect.top, left: rect.left, right: rect.right });
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      const parent = node.parentElement;
      if (text === "" || parent?.closest("script, style, [hidden], [data-ticker]") !== null) continue;
      if (getComputedStyle(parent).visibility === "hidden") continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) take(text.slice(0, 30), rect);
    }
    // The ticker is a strip across the foot of the screen, edge to edge by design: homeLive.spec measures it.
    for (const control of document.querySelectorAll("a[href], button, input, textarea, select, [tabindex]"))
      if (control.closest("[data-ticker]") === null)
        take(
          `<${control.tagName.toLowerCase()}> ${control.textContent.trim().slice(0, 30)}`,
          control.getBoundingClientRect(),
        );
    return found;
  });

for (const width of WIDTHS) {
  test.describe(`at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 844 } });

    for (const path of PAGES) {
      test(`${path}: no text and no control within ${String(GUTTER)} px of the viewport's edge, the top included`, async ({
        page,
      }) => {
        await page.goto(path);
        await hydrated(page);
        const touching = (await edgesOf(page)).filter(
          ({ top, left, right }) => top < GUTTER - 0.5 || left < GUTTER - 0.5 || right > width - GUTTER + 0.5,
        );
        expect(touching).toEqual([]);
      });
    }

    // Logging in needs the computer's button: the phone says to use a computer for that.
    const logInAt = async (page: Page) => {
      await page.setViewportSize({ width: 1280, height: 844 });
      const address = await logIn(page);
      await page.setViewportSize({ width, height: 844 });
      return address;
    };

    for (const path of PAGES) {
      test(`${path}: the home link, the account and Log out share one header row`, async ({ page }) => {
        const address = await logInAt(page);
        await page.goto(path);
        await hydrated(page);
        const account = page.getByTitle(address);
        // The shortening the chat's names get: the first six characters, an ellipsis, the last five.
        await expect(account).toHaveText(`${address.slice(0, 6)}…${address.slice(-5)}`);
        // One row means the boxes share a middle: each one's centre lies inside the others' height. On a phone the search is the
        // views' bar's, at the screen's foot (the prototype's #hnav .views), not of this row.
        const row = [
          page.getByRole("link", { name: "gnoworld" }),
          ...(width < 900 ? [] : [page.getByRole("button", { name: /^Search/ })]),
          account,
          page.getByRole("button", { name: "Log out" }),
        ];
        const boxes = await Promise.all(
          row.map(async (item) => {
            await expect(item).toBeVisible();
            return item.evaluate((element) => {
              const { top, bottom } = element.getBoundingClientRect();
              return { top, bottom };
            });
          }),
        );
        // The search control is the default control, 40 px with a mouse (44 by touch: search.spec.ts).
        const search = await page.getByRole("button", { name: /^Search/ }).boundingBox();
        expect(search?.width).toBeGreaterThanOrEqual(40);
        expect(search?.height).toBeGreaterThanOrEqual(40);
        const middles = boxes.map(({ top, bottom }) => (top + bottom) / 2);
        expect(boxes.filter(({ top, bottom }) => middles.some((m) => m < top || m > bottom))).toEqual([]);
        // The header keeps to the gutter too, logged in.
        expect(
          (await edgesOf(page)).filter(
            ({ top, left, right }) => top < GUTTER - 0.5 || left < GUTTER - 0.5 || right > width - GUTTER + 0.5,
          ),
        ).toEqual([]);
      });
    }

    for (const path of PAGES) {
      test(`${path}: axe finds nothing, logged out and logged in`, async ({ page }) => {
        await page.goto(path);
        await hydrated(page);
        // A page not found draws its title and heading once the router has matched nothing.
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await logInAt(page);
        await page.goto(path);
        await hydrated(page);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      });
    }

    for (const [name, path] of [
      ["", "/"],
      [" logged in", "/"],
      ["", "/w/bubble"],
      [" logged in", "/w/bubble"],
    ] as const) {
      test(`the update notice overlaps no control the keyboard reaches, on ${path}${name}`, async ({ page }) => {
        await page.goto(`${UPDATING}${path}`);
        await controlled(page);
        await hydrated(page);
        if (name !== "") {
          await adena(page);
          await page.reload();
          await hydrated(page);
          await page.getByRole("button", { name: "Log in with Adena" }).click();
          await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
        }
        expect((await page.request.post(`${UPDATING}/__bump`)).status()).toBe(204);
        await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
        const notice = page.locator("[popover]:popover-open");
        await expect(notice.getByText("New version available.")).toBeVisible();
        const covered = await page.evaluate(() => {
          const pill = document.querySelector("[popover]:popover-open")?.getBoundingClientRect() ?? new DOMRect();
          const focusable = "a[href], button, input, textarea, select, [tabindex]:not([tabindex='-1'])";
          return [...document.querySelectorAll(focusable)]
            .filter((element) => element.closest("[popover]") === null)
            .map((element) => ({ element, box: element.getBoundingClientRect() }))
            .filter(
              ({ box }) =>
                box.width > 0 &&
                box.right > pill.left &&
                box.left < pill.right &&
                box.bottom > pill.top &&
                box.top < pill.bottom,
            )
            .map(({ element }) => `<${element.tagName.toLowerCase()}> ${element.textContent.trim()}`);
        });
        expect(covered).toEqual([]);
      });
    }

    // The test wallet is drawn at each server's start: its address, as wide as its letters, is
    // replaced by one of the same length in letters of about the same width, so the header's row is one, as with the real one.
    test("the shell as it looks, logged out and logged in", async ({ page }) => {
      await page.goto("/");
      await hydrated(page);
      await expect(page).toHaveScreenshot(`shell-out-${String(width)}.png`);
      const address = await logInAt(page);
      await page.goto("/");
      await hydrated(page);
      await page.getByTitle(address).evaluate((element) => {
        element.textContent = "g1xxxx…xxxxx";
      });
      await expect(page).toHaveScreenshot(`shell-in-${String(width)}.png`);
    });
  });
}
