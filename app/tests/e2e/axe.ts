import AxeBuilder from "@axe-core/playwright";
import type { Page } from "./fixtures.ts";

/** What axe finds once the page's entrances have faded in: its colours are read mid-fade (a header at 7 % opacity reads 1:1), so it is
 * asked again until it finds nothing or 6 s pass, and the last answer stands. */
export async function violations(page: Page) {
  const until = Date.now() + 6000;
  let found = (await new AxeBuilder({ page }).analyze()).violations;
  while (found.length > 0 && Date.now() < until) {
    await page.waitForTimeout(500);
    found = (await new AxeBuilder({ page }).analyze()).violations;
  }
  return found;
}
