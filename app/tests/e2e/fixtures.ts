// One browser per test. On macOS, Chromium runs as one process (playwright.config.ts), and there
// closing a context ends the browser, so no test may share one with the test before it.
import { test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

export const test = base.extend({
  context: async ({ playwright, launchOptions, baseURL, javaScriptEnabled }, use) => {
    const browser = await playwright.chromium.launch(launchOptions);
    await use(await browser.newContext({ javaScriptEnabled, ...(baseURL === undefined ? {} : { baseURL }) }));
    await browser.close();
  },
});
