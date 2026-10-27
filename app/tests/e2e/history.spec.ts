import { lines } from "./chat.ts";
import { expect, test } from "./fixtures.ts";
import { opened } from "./scripted.ts";
import { GUEST, OTHER, T, tagmsg } from "./talk.ts";

// R1: a page of 200 history items that are all reactions holds no line; the page reads on, before its oldest, and shows
// the lines there (docs/decisions.md, 2026-10-26). A scripted Ergo (scripted.ts).
test("shows the lines before a page of 200 reactions, never a room with no message", async ({ page }) => {
  test.slow();
  const reactions = Array.from({ length: 200 }, (_, n) =>
    tagmsg(`r${String(n)}`, "+draft/react=👍;+reply=o3", { at: 10 + Math.floor(n / 4), who: OTHER }),
  );
  await opened(page, GUEST, {
    history: [],
    replayed: reactions,
    older: [
      ["o1", T(0), "an older line"],
      ["o2", T(1), "another older line"],
      ["o3", T(2), "the oldest line's answer"],
    ],
  });
  await expect(lines(page)).toHaveCount(3);
  await expect(page.getByText("No messages yet.")).toHaveCount(0);
  await expect(lines(page).nth(2)).toContainText("👍 1");
});
