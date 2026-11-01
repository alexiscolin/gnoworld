import { lines } from "./chat.ts";
import { open } from "./chatScreenOpen.ts";
import { expect, test } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { MEMBER } from "./scripted.ts";
import { threadOf } from "./thread.ts";

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

  // Review 15 of 5q: fourteen CSS mutants passed every assertion above; these read the frame (f0066, 1728 by 1080).
  test("sets the rooms' pills, the pin, the lines' time and the panel as frame 66 does", async ({ page }) => {
    await logIn(page, "geometry-frame");
    await open(page, { width: 1728, as: ACCOUNT, pinned: true, height: 1080 });
    const rooms = page.locator('[data-region="rooms"] [data-nav-item]');
    const [first, second] = [rooms.nth(0), rooms.nth(1)];
    const [one, two] = await Promise.all([first.boundingBox(), second.boundingBox()]);
    if (one === null || two === null) throw new Error("no pill");
    // The pill is 38 px high, 10 px round, a step of 44 to the next (frame: #general 101 to 139, #help 145 to 183).
    near(one.height, 38);
    near(two.y - one.y, 44);
    const current = await page.locator('[data-region="rooms"] [data-nav-item][data-current]').evaluate((element) => {
      const css = getComputedStyle(element);
      const [red = 0, green = 0, blue = 0] = css.backgroundColor.match(/\d+/g)?.map(Number) ?? [];
      return { radius: css.borderTopLeftRadius, cream: red + green + blue > 600, size: css.fontSize };
    });
    expect(current).toEqual({ radius: "10px", cream: true, size: "14px" });
    // The pin's words stand at y 84, 13 px on its line; the first line's head 129 (frame: 84 and 129).
    const pin = await page.getByRole("region", { name: "Pinned messages" }).getByRole("button").first().boundingBox();
    if (pin === null) throw new Error("no pin");
    near(pin.y + pin.height / 2, 84, 3);
    expect(
      await page
        .getByRole("region", { name: "Pinned messages" })
        .getByRole("button")
        .first()
        .evaluate((element) => getComputedStyle(element).fontSize),
    ).toBe("13px");
    const line = lines(page).first();
    const [face, time] = await Promise.all([
      line.locator("[data-kind]").first().boundingBox(),
      line.locator("time").boundingBox(),
    ]);
    if (face === null || time === null) throw new Error("no line");
    near(face.y + face.height / 2, 129, 3);
    const look = await line.locator("time").evaluate((element) => {
      const css = getComputedStyle(element);
      return { size: css.fontSize, mono: /mono/i.test(css.fontFamily) };
    });
    expect(look).toEqual({ size: "10px", mono: true });
  });

  test("sets the panel and the composer as frame 66 does", async ({ page }) => {
    await logIn(page, "geometry-panel");
    await open(page, { width: 1728, as: ACCOUNT, pinned: true, height: 1080 });
    // The panel: 20 px in from its edge, its title 32 px, the people a step of 41 (frame: Earth at x 1449, rows 410, 451).
    const info = await page.locator('[data-region="info"]').boundingBox();
    if (info === null) throw new Error("no panel");
    const title = await page.locator('[data-region="info"] h2').boundingBox();
    const people = page.locator('[data-region="info"] section[aria-label="Who\'s here"] li');
    if (title === null) throw new Error("no title");
    near(title.x - info.x, 20 + 1, 3);
    expect(
      await page.locator('[data-region="info"] h2').evaluate((element) => getComputedStyle(element).fontSize),
    ).toBe("32px");
    const [row1, row2] = await Promise.all([people.nth(0).boundingBox(), people.nth(1).boundingBox()]);
    if (row1 === null || row2 === null) throw new Error("no people");
    near(row2.y - row1.y, 41);
    // Send is round, 32 px; the format bar's icons 13 px in the muted grey; the field has no handle or ring of its own.
    const send = await page.getByRole("button", { name: "Send" }).evaluate((element) => {
      const css = getComputedStyle(element);
      return { radius: css.borderTopLeftRadius, wide: element.getBoundingClientRect().width };
    });
    expect(send.radius).toBe("50%");
    near(send.wide, 32);
    const field = await page.getByRole("textbox", { name: /^Message/ }).evaluate((element) => {
      const css = getComputedStyle(element);
      return { resize: css.resize, outline: css.outlineStyle };
    });
    expect(field).toEqual({ resize: "none", outline: "none" });
    const bar = await page
      .getByRole("group", { name: "Format" })
      .getByRole("button")
      .first()
      .evaluate((element) => ({
        icon: element.querySelector("svg")?.getBoundingClientRect().width,
        ink: getComputedStyle(element).color,
      }));
    near(bar.icon ?? 0, 13, 0.5);
    expect(bar.ink).not.toBe("rgb(244, 246, 250)");
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

  // 5q2, the differences 5q left (frames f0060, f0066, f0080 and the prototype's CSS): each held by what the frame shows.
  test("draws the worlds' planets at 44 px, the format bar's two rules, the thread at 13.5 px", async ({ page }) => {
    await logIn(page, "geometry-last");
    await open(page, { width: 1728, as: ACCOUNT, pinned: true, height: 1080 });
    // The planet: 44 px, the first 23 px under the region's top (frame 66: 76 - 53). Onyx holds one world, so no step is measured.
    const first = await page.locator('[data-region="worlds"] a > span').first().boundingBox();
    if (first === null) throw new Error("no planet");
    near(first.width, 44);
    near(first.height, 44);
    const worlds = await page.locator('[data-region="worlds"]').boundingBox();
    if (worlds === null) throw new Error("no worlds");
    near(first.y - worlds.y, 23, 2);
    // The ring of the world in view stands 4 px off its planet, a line wide (frame 66: 54 px round a 44 px planet).
    const ring = await page.locator('[data-region="worlds"] a[aria-current="page"]').evaluate((link) => {
      const css = getComputedStyle(link);
      return { width: css.outlineWidth, offset: css.outlineOffset, style: css.outlineStyle };
    });
    expect(ring).toEqual({ width: "1px", offset: "4px", style: "solid" });
    // The format bar: three groups, two rules of 1 px by 12 px between them (prototype #fmtBar .sep).
    const rules = page.getByRole("group", { name: "Format" }).getByRole("separator");
    await expect(rules).toHaveCount(2);
    for (const rule of await rules.all()) {
      const box = await rule.boundingBox();
      if (box === null) throw new Error("no rule");
      near(box.width, 1, 0.5);
      near(box.height, 12, 0.5);
    }
    // The thread: the title and the lines at the video's 13.5 px (prototype #threadPane .ttl2 b, #threadList li).
    await threadOf(lines(page).first());
    const panel = page.getByRole("complementary", { name: "Thread" });
    await expect(panel).toBeVisible();
    const sizes = await panel.evaluate((element) => ({
      title: getComputedStyle(element.querySelector("h3") ?? element).fontSize,
      text: getComputedStyle(element.querySelector("[data-line-text]") ?? element).fontSize,
    }));
    expect(sizes).toEqual({ title: "13.5px", text: "13.5px" });
  });

  test("names a direct message's header 'Direct message', the room's keeps its place", async ({ page }) => {
    await logIn(page, "geometry-dm");
    await open(page, { width: 1728, as: ACCOUNT, pinned: true, height: 1080 });
    const header = page.locator('[data-region="header"]');
    await expect(header.getByText("Direct message", { exact: true })).toHaveCount(0);
    await page.goto(`/w/bubble?dm=${MEMBER}&chat=full`);
    await expect(header.getByText("Direct message", { exact: true })).toBeVisible();
  });

  test("draws the rooms as chips in the dock, a row under the header, none in the full chat", async ({ page }) => {
    await logIn(page, "geometry-chips");
    await open(page, { width: 1728, as: ACCOUNT, height: 1080, full: false });
    const dock = await page.locator("[data-chat-layout]").boundingBox();
    if (dock === null) throw new Error("no dock");
    const chips = page.getByRole("navigation", { name: "Room shortcuts" });
    await expect(chips).toBeVisible();
    const chip = chips.getByRole("link", { name: "#games" });
    await expect(chip).toHaveAttribute("aria-current", "true");
    const [row, mine, header, line] = await Promise.all([
      chips.boundingBox(),
      chip.boundingBox(),
      page.locator('[data-region="header"]').boundingBox(),
      lines(page).first().boundingBox(),
    ]);
    if (row === null || mine === null || header === null || line === null) throw new Error("not drawn");
    // Frame 26: a row of pills under the header's rule, 27 px high, 24 px in from the dock's edge, the lines under them.
    expect(row.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(row.y + row.height).toBeLessThanOrEqual(line.y);
    near(mine.x - dock.x, 24, 2);
    near(mine.height, 27, 2);
    const look = await chip.evaluate((element) => {
      const css = getComputedStyle(element);
      return { size: css.fontSize, radius: css.borderTopLeftRadius };
    });
    expect(look).toEqual({ size: "12px", radius: "999px" });
    await page.goto("/w/bubble?room=games&chat=full");
    await expect(chips).toHaveCount(0);
  });

  test("looks as the video's frame does", async ({ page }) => {
    await logIn(page, "geometry-look");
    await open(page, { width: 1728, as: ACCOUNT, pinned: true, height: 1080 });
    await expect(page.locator("[data-chat-layout]")).toHaveScreenshot("chat-screen-computer.png");
  });
});
