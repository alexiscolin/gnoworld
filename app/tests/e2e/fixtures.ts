// In Claude Code's sandbox Chromium runs as one process (playwright.config.ts), where closing a
// context ends the browser, so each test gets a browser of its own; elsewhere, Playwright's own.
import { test as base, type Page } from "@playwright/test";
import { WORLDS, worldPath } from "../../src/worlds.ts";

import { expect } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

declare const process: { env: Record<string, string | undefined> };
// Playwright hands a screenshot as Node's Buffer, whose types this folder leaves out, as process's.
declare global {
  interface Buffer {
    toString(encoding: "base64"): string;
  }
}

const ownBrowser = base.extend({
  context: async ({ playwright, launchOptions, contextOptions, baseURL, javaScriptEnabled }, use) => {
    const browser = await playwright.chromium.launch(launchOptions);
    await use(
      await browser.newContext({ ...contextOptions, javaScriptEnabled, ...(baseURL === undefined ? {} : { baseURL }) }),
    );
    await browser.close();
  },
});

const FLUSH = "https://flush.invalid/";
const MARK = "csp-violation";

// Every journey runs under the site's CSP: a violation no test planted fails it (slice 3's plan, 3f).
// The directives a page's documents reported, written to its console, which outlives a navigation.
export const test = (process.env["SANDBOX_RUNTIME"] ? ownBrowser : base).extend<{
  planted: boolean;
  violations: string[];
}>({
  planted: [false, { option: true }],
  violations: [
    async ({ page, planted, javaScriptEnabled }, use) => {
      const context = page.context();
      const seen: string[] = [];
      // The pages whose document came with a policy, in every tab of the test's context: one a test makes
      // up itself carries none.
      const policed = new Set<Page>();
      context.on("response", (response) => {
        const request = response.request();
        // A service worker's own fetch belongs to no frame.
        if (!request.isNavigationRequest() || request.serviceWorker() !== null) return;
        const frame = request.frame();
        if (frame !== frame.page().mainFrame()) return;
        if (response.headers()["content-security-policy"] === undefined) policed.delete(frame.page());
        else policed.add(frame.page());
      });
      context.on("console", (message) => {
        const [mark, directive] = message.text().split(" ");
        if (mark === MARK && directive !== undefined) seen.push(directive);
      });
      await context.addInitScript(
        ([mark, flush]) => {
          document.addEventListener("securitypolicyviolation", (event) => {
            console.info(mark, event.blockedURI === flush ? "flush" : event.effectiveDirective);
          });
        },
        [MARK, FLUSH],
      );
      await use(seen);
      // A violation reaches the test as a task: one planted last, once seen, says every earlier one came.
      for (const each of javaScriptEnabled ? policed : []) {
        if (each.isClosed()) continue;
        await each.evaluate((flush) => {
          new Image().src = flush;
        }, FLUSH);
        await expect.poll(() => seen.at(-1), { message: "the page's policy reported the flush" }).toBe("flush");
        seen.pop();
      }
      if (!planted) expect(seen, "a CSP violation no test planted").toEqual([]);
    },
    { auto: true },
  ],
});

// React marks the document it hydrated; the static HTML alone never carries the mark.
export const reactMark = () => Object.keys(document).some((key) => key.startsWith("__reactContainer"));

export async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(reactMark);
}

// The site's pages: the home, and each world's.
export const PAGES = ["/", ...WORLDS.map(worldPath)];

// A worker controls the page, so its install is done.
export async function controlled(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

export const cacheContents = (page: Page) =>
  page.evaluate(async () => {
    const names = await caches.keys();
    const paths: string[] = [];
    for (const name of names)
      for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname);
    return { names, paths: paths.sort() };
  });
