import { lines } from "./chat.ts";
import { open } from "./chatScreenOpen.ts";
import { expect, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";

// 5q, item 7 of the chief's comparison: the video's chat text is 13.5 px on 1.45 (prototype index.html:138, 196-200), a
// half point under the design system's body. Measured on what the chat draws, the lines, the pin and the field.
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

test.describe("the chat's text at the video's size", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB", viewport: { width: 1728, height: 1080 } });

  test("sets the lines, the pin and the field in 13.5 px on 1.45", async ({ page }) => {
    await logIn(page, "chat-text");
    await open(page, { width: 1728, as: ACCOUNT, pinned: true, height: 1080 });
    const first = lines(page).first();
    const of = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((e) => {
          const css = getComputedStyle(e);
          return `${css.fontSize} ${String(Math.round((parseFloat(css.lineHeight) / parseFloat(css.fontSize)) * 100) / 100)}`;
        });
    await expect(first).toBeVisible();
    expect(await first.locator("[data-line-text]").evaluate((e) => getComputedStyle(e).fontSize)).toBe("13.5px");
    expect(await of('[role="group"][aria-label="Message box"] textarea')).toBe("13.5px 1.45");
    expect(await of('section[aria-label="Pinned messages"] button')).toBe("13.5px 1.45");
  });
});
