import { roomsNav, word } from "./chat.ts";
import { expect, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { field, live, room, T } from "./scriptedRoom.ts";

// How what an account has not seen looks (slice 4's 4f-n), on a computer's screen: the counts on the rooms' rows, the
// list, the composer's word on @room. A scripted Ergo, so the same each run; the header,
// and who is here, which name the test wallet drawn at the server's start, are masked.
test.describe("what an account has not seen, as it looks", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("counts on the rows and the list, on a computer's screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const address = await logIn(page, word("notice-look"));
    const { ergo } = await room(page, {
      me: address,
      read: T(2),
      others: { "#bubble": [["b1", T(10), "an old line"]] },
    });
    ergo().send(live("n1", T(31), { room: "#bubble", text: `look @${address}` }));
    ergo().send(live("n2", T(32), { room: "#bubble/news", text: "@room the release is out" }));
    await expect(roomsNav(page).getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(
      roomsNav(page)
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: "news", exact: true }) }),
    ).toContainText("1 unread");
    await expect(page).toHaveScreenshot("notices-computer.png", {
      mask: [page.getByRole("banner"), page.getByRole("region", { name: "Who's here" })],
    });
  });

  test("the composer's word on @room, on a computer's screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await room(page, { me: await logIn(page, word("hint-look")) });
    await field(page).fill("@ro");
    await field(page).press("Tab");
    await expect(page.getByText("@room notifies no one in this room", { exact: false })).toBeVisible();
    await expect(page).toHaveScreenshot("room-hint-computer.png", {
      mask: [page.getByRole("banner"), page.getByRole("region", { name: "Who's here" })],
    });
  });
});
