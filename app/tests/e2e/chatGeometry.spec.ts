import { lines } from "./chat.ts";
import { open } from "./chatScreenOpen.ts";
import { expect, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";

// 5q, pixel perfect to the video: the chat at its frames' size (1728 by 1080, scale 1), each region's box measured against
// the frame (`.claude/tmp/slice-5/video-frames`, f0060) and the prototype's CSS (docs/prototype/source/index.html:133-700).
// Offsets are read from the chat's own box, the page's header staying over it until the dock (slice 7).
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const near = (value: number, wanted: number, slack = 1) => {
  expect(
    Math.abs(value - wanted),
    `${String(value)} is not ${String(wanted)} within ${String(slack)}`,
  ).toBeLessThanOrEqual(slack);
};

test.describe("the chat at the video's size", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB", viewport: { width: 1728, height: 1080 } });

  test("places each region at the frame's measures", async ({ page }) => {
    await logIn(page, "geometry");
    await open(page, { width: 1728, as: ACCOUNT, pinned: true, height: 1080 });
    const at = async (selector: string) => {
      const found = await page.locator(selector).boundingBox();
      if (found === null) throw new Error(`${selector} is not drawn`);
      return found;
    };
    const root = await at("[data-chat-layout]");
    const header = await at('[data-region="header"]');
    const worlds = await at('[data-region="worlds"]');
    const rooms = await at('[data-region="rooms"]');
    const talk = await at('[data-region="conversation"]');
    const info = await at('[data-region="info"]');

    // The frame: a header 53 px high (52 and its rule), worlds 82, rooms 158, the conversation the rest, the panel 300.
    near(root.height, 1080);
    near(header.height, 53);
    near(header.width, root.width);
    for (const region of [worlds, rooms, talk, info]) {
      near(region.y, root.y + 53);
      near(region.height, root.height - 53);
    }
    near(worlds.x, root.x);
    near(worlds.width, 82);
    near(rooms.x, root.x + 82);
    near(rooms.width, 158);
    near(talk.x, root.x + 240);
    near(talk.width, root.width - 540);
    near(info.width, 300);
    near(info.x, root.x + root.width - 300);

    // A line: the nebula 20 px, the name beside it, the time at the edge 32 px in, the text 22 px under the head, the
    // next line 58 px on (frame rows 146 and 204).
    const [first, second] = [lines(page).nth(0), lines(page).nth(1)];
    const [row1, row2, face, time, text] = await Promise.all([
      first.boundingBox(),
      second.boundingBox(),
      first.locator("[data-kind]").first().boundingBox(),
      first.locator("time").boundingBox(),
      first.locator("[data-line-text]").boundingBox(),
    ]);
    if (row1 === null || row2 === null || face === null || time === null || text === null) throw new Error("no line");
    near(row1.x, talk.x + 32);
    near(time.x + time.width, talk.x + talk.width - 32);
    near(face.width, 20);
    near(face.height, 20);
    near(text.y - face.y, 22, 2);
    near(row2.y - row1.y, 58, 2);

    // The pinned line over the lines, at the same inset; the quick actions 32 px high; the composer box 16 px round and
    // as wide as the lines, 16 px under the quick actions.
    const pin = await at('[aria-label="Pinned messages"]');
    near(pin.x, talk.x + 32);
    expect(pin.y + pin.height).toBeLessThanOrEqual(row1.y);
    const quick = await at('[role="toolbar"][aria-label="Quick actions"]');
    const message = await at('[role="group"][aria-label="Message box"]');
    const button = await at('[role="toolbar"][aria-label="Quick actions"] button');
    near(button.height, 32);
    near(message.x, talk.x + 32);
    near(message.width, talk.width - 64);
    near(message.y - (button.y + button.height), 16, 2);
    expect(quick.y + quick.height).toBeLessThanOrEqual(message.y);
    near(talk.y + talk.height - (message.y + message.height), 20, 2);
    const radius = await page
      .locator('[role="group"][aria-label="Message box"]')
      .evaluate((e) => getComputedStyle(e).borderTopLeftRadius);
    expect(radius).toBe("16px");
  });

  test("draws the quick actions as the video's pills: an edge, 12 px words centred, the row's whole width shared", async ({
    page,
  }) => {
    await logIn(page, "geometry-pills");
    await open(page, { width: 1728, as: ACCOUNT, pinned: true, height: 1080 });
    const pill = page.locator('[role="toolbar"][aria-label="Quick actions"] button').first();
    const look = await pill.evaluate((e) => {
      const css = getComputedStyle(e);
      const text = document.createRange();
      text.selectNodeContents(e);
      const [at, around] = [text.getBoundingClientRect(), e.getBoundingClientRect()];
      return {
        edge: css.borderTopWidth,
        // Drawn: an edge of a colour, not the transparent one.
        seen: !/^rgba\(.*, 0\)$/.test(css.borderTopColor) && css.borderTopColor !== "transparent",
        size: css.fontSize,
        offCentre: Math.round(Math.abs(at.left + at.width / 2 - (around.left + around.width / 2))),
      };
    });
    expect(look).toEqual({ edge: "1px", seen: true, size: "12px", offCentre: 0 });
    const [row, bar] = await Promise.all([
      page.locator('[role="toolbar"][aria-label="Quick actions"]').boundingBox(),
      pill.boundingBox(),
    ]);
    if (row === null || bar === null) throw new Error("not drawn");
    near(bar.width, row.width);
    // The format bar's buttons are the smallest control, 24 px square (the video's 24 high).
    const tool = await page.getByRole("group", { name: "Format" }).getByRole("button").first().boundingBox();
    if (tool === null) throw new Error("not drawn");
    near(tool.height, 24);
    near(tool.width, 24);
  });

  test("looks as the video's frame does", async ({ page }) => {
    await logIn(page, "geometry-look");
    await open(page, { width: 1728, as: ACCOUNT, pinned: true, height: 1080 });
    await expect(page.locator("[data-chat-layout]")).toHaveScreenshot("chat-screen-computer.png");
  });
});
