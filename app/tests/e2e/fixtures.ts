// In Claude Code's sandbox Chromium runs as one process (playwright.config.ts), where closing a
// context ends the browser, so each test gets a browser of its own; elsewhere, Playwright's own.
import { test as base, type Page } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

declare const process: { env: Record<string, string | undefined> };

const ownBrowser = base.extend({
  context: async ({ playwright, launchOptions, contextOptions, baseURL, javaScriptEnabled }, use) => {
    const browser = await playwright.chromium.launch(launchOptions);
    await use(
      await browser.newContext({ ...contextOptions, javaScriptEnabled, ...(baseURL === undefined ? {} : { baseURL }) }),
    );
    await browser.close();
  },
});

export const test = process.env["SANDBOX_RUNTIME"] ? ownBrowser : base;

// React marks the document it hydrated; the static HTML alone never carries the mark.
export const reactMark = () => Object.keys(document).some((key) => key.startsWith("__reactContainer"));

export async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(reactMark);
}
