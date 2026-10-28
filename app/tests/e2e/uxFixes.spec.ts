import { roomsNav, word } from "./chat.ts";
import { expect, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { live, room, T } from "./scriptedRoom.ts";

// The slice 4 UX review's majors that ship before slice 5: U4 (a first notification moving the page).
test.describe("the slice 4 UX review's fixes", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

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
