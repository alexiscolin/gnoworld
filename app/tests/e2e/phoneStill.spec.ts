import { devices, type Browser } from "@playwright/test";
import { lines } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { scriptedErgo, type HistoryLine } from "./scripted.ts";
import { GUEST, T } from "./talk.ts";

// A phone's screen stands still (Safari on iPhone): the document never scrolls on a view with the chat, so the header, the chat's frame and
// the composer cannot move with a pull past an end; the lines alone scroll, and hand no scroll on to the page. Walked in WebKit and in
// Chromium with an iPhone's profile (Claude Code's sandbox starts no WebKit: its half runs outside it). No headless engine draws the
// rubber band itself: a real iPhone alone shows it.
const ENGINES = ["webkit", "chromium"] as const;
// Where a phone's chat stands: its start (the Earth's), the Earth, a world, a world's room.
const VIEWS = ["/", "/earth", "/w/govdao", "/w/bubble?room=games"];
// More lines than a screen holds.
const MANY: readonly HistoryLine[] = Array.from({ length: 60 }, (_, at) => [
  `s${String(at)}`,
  T(at),
  `line ${String(at)} of a long room`,
]);

// The box that scrolls the lines: the first one up from the list that scrolls on the block axis.
const scroller = (page: Page) =>
  lines(page)
    .first()
    .evaluateHandle((line) => {
      let box = line.parentElement;
      while (box !== null && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
      if (box === null) throw new Error("no box scrolls the lines");
      return box;
    });

// The document as it stands: how much taller than the screen, how far scrolled, and where the header and the chat's screen are.
const frame = (page: Page) =>
  page.evaluate(() => ({
    taller: document.documentElement.scrollHeight - window.innerHeight,
    scrolled: window.scrollY,
    header: document.querySelector("header")?.getBoundingClientRect().top,
    screen: document.querySelector("[data-chat-screen][data-full]")?.getBoundingClientRect().toJSON() as unknown,
  }));

for (const engine of ENGINES) {
  test.describe(`a phone's screen stands still in ${engine}`, () => {
    let browser: Browser;
    let page: Page;

    test.beforeEach(async ({ playwright, launchOptions, baseURL }) => {
      // Chromium's one-process flag is its own (playwright.config.ts); WebKit takes none.
      browser = await playwright[engine].launch(engine === "chromium" ? launchOptions : {});
      const context = await browser.newContext({
        ...devices["iPhone 14"],
        ...(baseURL === undefined ? {} : { baseURL }),
      });
      await context.addInitScript(() => {
        localStorage.setItem("gnoworld:welcomed", "1");
        localStorage.setItem("gnoworld:entered", "1");
      });
      page = await context.newPage();
      await page.routeWebSocket(/\/ws$/, (ergo) => {
        scriptedErgo(ergo, GUEST, { history: MANY });
      });
    });

    test.afterEach(async () => {
      await browser.close();
    });

    for (const view of VIEWS) {
      test(`${view}: the document never scrolls, and the lines keep their scroll`, async () => {
        await page.goto(view);
        await hydrated(page);
        await expect(page).toHaveURL(/chat=full/);
        await expect(page.locator("[data-chat-screen][data-full]")).toBeVisible();
        const was = await frame(page);
        expect(was.taller, "the document, as tall as the screen").toBe(0);
        expect(
          await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY),
          "the root takes no pull past its ends",
        ).toBe("none");

        // Asked to scroll, the document stays, and the frame with it.
        await page.evaluate(() => {
          window.scrollTo(0, 400);
        });
        expect(await frame(page)).toEqual(was);

        if (!view.includes("room=games")) return;
        await expect(lines(page)).toHaveCount(MANY.length);
        const box = await scroller(page);
        expect(
          await box.evaluate((el) => getComputedStyle(el).overscrollBehaviorY),
          "the lines hand no scroll on",
        ).toBe("contain");
        expect(await box.evaluate((el) => el.scrollHeight > el.clientHeight), "the lines scroll").toBe(true);
        // Mobile WebKit takes no wheel from Playwright: the lines are put at each end there, and wheeled past it in Chromium.
        for (const end of [0, 1e6]) {
          await box.evaluate((el, top) => {
            el.scrollTop = top;
          }, end);
          if (engine === "chromium") {
            const at = await box.evaluate((el) => {
              const { left, top, width, height } = el.getBoundingClientRect();
              return { x: left + width / 2, y: top + height / 2 };
            });
            await page.mouse.move(at.x, at.y);
            await page.mouse.wheel(0, end === 0 ? -600 : 600);
            await page.waitForTimeout(300);
          }
          expect(await frame(page)).toEqual(was);
        }
      });
    }
  });
}
