// One browser per test: in one-process Chromium (playwright.config.ts, in the sandbox), closing a
// context ends the browser, so no test may share one with the test before it.
import { test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

export const test = base.extend({
  context: async ({ playwright, launchOptions, contextOptions, baseURL, javaScriptEnabled }, use) => {
    const browser = await playwright.chromium.launch(launchOptions);
    await use(
      await browser.newContext({ ...contextOptions, javaScriptEnabled, ...(baseURL === undefined ? {} : { baseURL }) }),
    );
    await browser.close();
  },
});
