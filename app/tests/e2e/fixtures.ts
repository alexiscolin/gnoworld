// In Claude Code's sandbox Chromium runs as one process (playwright.config.ts), where closing a
// context ends the browser, so each test gets a browser of its own; elsewhere, Playwright's own.
import { expect, test as base, type Page, type Response as Answer, type Worker } from "@playwright/test";
import { VIOLATION } from "../../src/sw/report.ts";
import { WORLDS, worldPath } from "../../src/places.ts";

export { expect, type Answer, type Page };

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

// A violation reaches the test as a task: one planted last, once seen, says every earlier one came. A
// navigation under way may take the first try's document away: the next try plants it in the new one.
async function flush(page: Page): Promise<void> {
  const done = page.waitForEvent("console", (message) => message.text() === `${MARK} flush`);
  await expect(async () => {
    await page.evaluate((url) => {
      new Image().src = url;
    }, FLUSH);
  }).toPass();
  await done;
}

// A worker's violation reaches the test as a message to the pages (src/sw/report.ts), after the worker's own
// task: a fetch the policy refuses, planted last in the worker, says every earlier violation of the worker came.
// A navigation under way may lose the message with the old document: each try plants the fetch again (F2066).
async function flushWorker(page: Page, worker: Worker): Promise<void> {
  await expect(async () => {
    const done = page.waitForEvent("console", {
      predicate: (message) => message.text() === `${MARK} flush`,
      timeout: 3000,
    });
    // Both settled, so a try that fails leaves no rejection unhandled behind it.
    const tries = await Promise.allSettled([
      worker.evaluate(
        (url) =>
          fetch(url).then(
            () => undefined,
            () => undefined,
          ),
        FLUSH,
      ),
      done,
    ]);
    expect(tries.map(({ status }) => status)).toEqual(["fulfilled", "fulfilled"]);
  }).toPass();
}

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
        if (mark === MARK && directive !== undefined && directive !== "flush") seen.push(directive);
      });
      await context.addInitScript(
        ([mark, flush, told]) => {
          document.addEventListener("securitypolicyviolation", (event) => {
            console.info(mark, event.blockedURI === flush ? "flush" : event.effectiveDirective);
          });
          // What the service worker tells its pages of its own violations.
          navigator.serviceWorker.addEventListener("message", (event: MessageEvent<unknown>) => {
            const data = event.data;
            if (typeof data !== "object" || data === null || !("type" in data) || data.type !== told) return;
            if ("directive" in data && "blockedURI" in data)
              console.info(mark, data.blockedURI === flush ? "flush" : data.directive);
          });
        },
        [MARK, FLUSH, VIOLATION],
      );
      await use(seen);
      const open = [...policed].filter((each) => !each.isClosed());
      // The first open page takes the worker's messages; each is flushed after.
      const [listening] = javaScriptEnabled ? open : [];
      if (listening !== undefined) for (const worker of context.serviceWorkers()) await flushWorker(listening, worker);
      for (const each of javaScriptEnabled ? open : []) await flush(each);
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
