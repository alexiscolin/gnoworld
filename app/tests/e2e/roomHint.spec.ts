import { roomsNav, word } from "./chat.ts";
import { expect, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { field, room } from "./scriptedRoom.ts";

// 4f-n (docs/decisions.md, 2026-10-27, N3): @room notifies in an announcement or members room alone; the composer says,
// as @room is typed or completed, whether it does here and why not. A scripted Ergo, an account in #games (open),
// #news (announcement) a link away.
test.describe("the composer's word on @room", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("says, as @room is typed or completed, whether it notifies in the room", async ({ page }) => {
    await room(page, { me: await logIn(page, word("hint")) });
    const box = field(page);
    await box.fill("@ro");
    await expect(page.getByText("Tab completes @room.")).toBeVisible();
    await box.press("Tab");
    await expect(box).toHaveValue("@room ");
    await expect(
      page.getByText("@room notifies no one in this room: it counts only in announcement and members rooms."),
    ).toBeVisible();
    await roomsNav(page).getByRole("link", { name: "#news", exact: true }).click();
    await page.getByRole("textbox", { name: "Message #news" }).fill("@room the release is out");
    await expect(page.getByText("@room notifies the members who keep notifications on for this room.")).toBeVisible();
  });
});
