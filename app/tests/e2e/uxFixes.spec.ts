import { lines, roomsNav, word } from "./chat.ts";
import { expect, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { live, room, T } from "./scriptedRoom.ts";
import { asAccount, barOf, crossedByBar } from "./talk.ts";
import type { HistoryLine } from "./scripted.ts";

// The slice 4 UX review's majors that ship before slice 5: U1 (the bar over a line's words) and U4 (a first
// notification moving the page).
const LONG =
  "Rules and the whole scoring table are a lot to read at once, so this line says the same thing again and again until it " +
  "fills the column and wraps onto a third row, which is where the bar of a long line used to lie on its words, again";

test.describe("the slice 4 UX review's fixes", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  // U1: the bar's five controls are about 200 px wide and the line kept room for one control, so on a line that fills the
  // column the bar lay over its first row's last words.
  for (const width of [1280, 1000]) {
    test(`a line's bar covers none of its words, nor any other line's, on a ${String(width)} px screen`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const history: HistoryLine[] = [0, 1, 2].map((n) => [`l${String(n)}`, T(n), `${LONG} ${String(n)}`]);
      await asAccount(page, () => ({ history }), 3);
      for (const at of [0, 1, 2]) {
        await lines(page).nth(at).hover();
        await expect(barOf(page, at)).toBeVisible();
        expect(await crossedByBar(page), `line ${String(at)}`).toEqual([]);
      }
    });
  }

  // U4: the Notifications block above the rooms widened the rail from 190 to 245 px and dropped the room list.
  test("a first notification moves neither the message column nor a room's row", async ({ page }) => {
    const address = await logIn(page, word("steady"));
    const { ergo } = await room(page, { me: address, read: T(2) });
    const place = async () => ({
      column: (await page.getByRole("list", { name: "Messages" }).boundingBox())?.x,
      rail: (await roomsNav(page).boundingBox())?.width,
      // The rows down to #bubble's, which the mention's own unread count then makes taller: the rows after it move by that.
      rows: await roomsNav(page)
        .getByRole("link", { name: /^#/ })
        .evaluateAll((links) => links.slice(0, 2).map((link) => link.getBoundingClientRect().y)),
    });
    const before = await place();
    ergo().send(
      live("n1", T(31), { room: "#bubble", text: `look @${address} and a long, long word to widen the row` }),
    );
    await expect(roomsNav(page).getByRole("heading", { name: "Notifications" })).toBeVisible();
    expect(await place()).toEqual(before);
  });
});
