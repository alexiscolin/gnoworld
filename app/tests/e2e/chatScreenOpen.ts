// What the chat-screen journeys share (5q): #games opened as an account or a guest, its two lines scripted and, when asked, a
// pin the server holds.
import { lines } from "./chat.ts";
import { expect, hydrated, type Page } from "./fixtures.ts";
import { MEMBER, scriptedErgo } from "./scripted.ts";

export const PIN = "Welcome. Be kind, no spam, any language is fine.";

/** Opens #games as `as`, its two lines scripted and, when asked, a pin the server holds: the full chat unless `full` is
 * false, which leaves the docked chat of a wide window. */
export async function open(
  page: Page,
  {
    width,
    as,
    pinned = false,
    height = 900,
    full = true,
  }: { width: number; as: string; pinned?: boolean; height?: number; full?: boolean },
) {
  await page.setViewportSize({ width, height });
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, as, {
      history: [
        ["m1", "2026-10-25T15:31:00.000Z", "Lagos builders, we have a room now"],
        ["m2", "2026-10-25T15:40:00.000Z", `hello @${MEMBER}`],
      ],
    });
  });
  if (pinned) {
    await page.route("**/api/pins?**", (route) =>
      route.fulfill({
        json: {
          room: "#bubble/games",
          may: false,
          pins: [{ id: "m0", time: "2026-10-25T15:00:00.000Z", account: MEMBER, text: PIN }],
        },
      }),
    );
  }
  await page.goto(full ? "/w/bubble?room=games&chat=full" : "/w/bubble?room=games");
  await hydrated(page);
  await expect(lines(page)).toHaveCount(2);
}
