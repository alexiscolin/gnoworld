import AxeBuilder from "@axe-core/playwright";
import { lines } from "./chat.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { open, PIN } from "./chatScreenOpen.ts";
import { scriptedErgo } from "./scripted.ts";

// 5q: the chat as the video shows it (frames 23.58.01 and 23.57.54 of .claude/tmp/slice-5/video-frames): worlds, rooms,
// conversation and info panel at a computer's width, the conversation first at a phone's. Scripted Ergo, so each run draws
// the same lines; the measured boxes are chatGeometry.spec.ts's.
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const GUEST = "guest-zzzzzz";

const box = async (locator: ReturnType<Page["locator"]>) => {
  const found = await locator.boundingBox();
  if (found === null) throw new Error("not drawn");
  return found;
};
const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const worlds = (page: Page) => page.getByRole("navigation", { name: "Worlds" });
const info = (page: Page) => page.getByRole("complementary", { name: "Bubble" });
const roomsNav = (page: Page) => page.getByRole("navigation", { name: /^Rooms/ });
const roomsButton = (page: Page) => page.getByRole("button", { name: "Rooms" });

test.describe("the chat as the video shows it", () => {
  test.use({ timezoneId: "UTC", locale: "en-GB" });

  test("has the four columns of the video at a computer's width, left to right, the header over them, no dead control", async ({
    page,
  }) => {
    await logIn(page, "screen-look");
    await open(page, { width: 1280, as: ACCOUNT });
    const heading = page.getByRole("heading", { level: 2, name: "#games" });
    const [w, r, talk, i, h] = await Promise.all([
      box(worlds(page)),
      box(roomsNav(page)),
      box(page.getByRole("list", { name: "Messages" })),
      box(info(page)),
      box(heading),
    ]);
    expect(w.x + w.width).toBeLessThanOrEqual(r.x + 1);
    expect(r.x + r.width).toBeLessThanOrEqual(talk.x + 1);
    expect(talk.x + talk.width).toBeLessThanOrEqual(i.x + 1);
    expect(h.y + h.height).toBeLessThanOrEqual(w.y + 1);
    await expect(worlds(page).getByRole("link", { name: "Bubble" })).toHaveAttribute("aria-current", "page");
    // The full chat has its dock to shrink to, and Close leaves the chat for the universe's home.
    await expect(page.getByRole("button", { name: "Shrink the chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Expand the chat" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close the chat" })).toBeVisible();
  });

  test("closes to the universe's home, at the header's right edge, a control that works", async ({ page }) => {
    await logIn(page, "screen-close");
    await open(page, { width: 1280, as: ACCOUNT });
    const home = await page
      .getByRole("navigation", { name: "You are here" })
      .getByRole("link")
      .first()
      .getAttribute("href");
    const close = page.getByRole("button", { name: "Close the chat" });
    const [bar, shut] = await Promise.all([box(page.locator('[data-region="header"]')), box(close)]);
    expect(bar.x + bar.width - (shut.x + shut.width)).toBeLessThanOrEqual(24);
    await close.click();
    await expect(page).toHaveURL(new RegExp(`${String(home).replaceAll("/", "\\/")}$`));
    await expect(page.locator("[data-chat-layout]")).toHaveCount(0);
  });

  test("draws each line with its nebula, its name, its time at the right edge and its text below", async ({ page }) => {
    await open(page, { width: 1280, as: GUEST });
    const first = lines(page).first();
    const face = first.locator("[data-kind]").first();
    const time = first.locator("time");
    const text = first.getByText("Lagos builders, we have a room now");
    const [f, t, x, row] = await Promise.all([
      face.boundingBox(),
      time.boundingBox(),
      text.boundingBox(),
      first.boundingBox(),
    ]);
    if (f === null || t === null || x === null || row === null) throw new Error("not drawn");
    expect(t.x + t.width).toBeGreaterThan(row.x + row.width - 4);
    expect(x.y).toBeGreaterThan(t.y + t.height - 2);
    expect(f.x).toBeLessThan(t.x);
    await expect(first.locator("[data-country]")).toHaveCount(0);
  });

  test("puts the pinned line first in the conversation, above the messages, its author and words in view", async ({
    page,
  }) => {
    await open(page, { width: 1280, as: GUEST, pinned: true });
    const conversation = page.locator('[data-region="conversation"]');
    const pin = conversation.getByRole("region", { name: "Pinned messages" });
    await expect(pin).toContainText(PIN);
    await expect(pin).toContainText("g10gh7…3y5tv");
    const [p, talk] = await Promise.all([box(pin), box(page.getByRole("list", { name: "Messages" }))]);
    expect(p.y + p.height).toBeLessThanOrEqual(talk.y + 1);
    expect(await conversation.locator(":scope > *").first().innerHTML()).toContain("Pinned messages");
  });

  test("keeps the quick actions, over the composer's one box, an account's", async ({ page }) => {
    await logIn(page, "screen-composer");
    await open(page, { width: 1280, as: ACCOUNT });
    const bar = page.getByRole("toolbar", { name: "Quick actions" });
    await expect(bar.getByRole("button")).toHaveText(["Who's here"]);
    const message = page.getByRole("group", { name: "Message box" });
    await expect(message.getByRole("textbox")).toBeVisible();
    await expect(message.getByRole("button", { name: "Send" })).toBeVisible();
    const [b, m] = await Promise.all([bar.boundingBox(), message.boundingBox()]);
    if (b === null || m === null) throw new Error("not drawn");
    expect(b.y + b.height).toBeLessThanOrEqual(m.y + 1);
    const style = await message.evaluate((element) => {
      const { borderTopLeftRadius, borderTopWidth } = getComputedStyle(element);
      return { borderTopLeftRadius, borderTopWidth };
    });
    expect(style).toEqual({ borderTopLeftRadius: "16px", borderTopWidth: "1px" });
  });

  test("moves the reader to the people in the info panel when Who's here is pressed, at a computer's width", async ({
    page,
  }) => {
    await open(page, { width: 1280, as: GUEST });
    await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Who's here" }).click();
    await expect(info(page)).toBeFocused();
    await expect(info(page).getByRole("region", { name: "Who's here" })).toContainText("here");
  });

  test("keeps its lines in a list that scrolls alone, the document and the composer staying put", async ({ page }) => {
    await logIn(page, "screen-scroll");
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.routeWebSocket(/\/ws$/, (ergo) => {
      scriptedErgo(ergo, ACCOUNT, {
        history: Array.from({ length: 40 }, (_, n) => [
          `m${String(n)}`,
          `2026-10-25T15:${String(10 + n).padStart(2, "0")}:00.000Z`,
          `line number ${String(n)}`,
        ]),
      });
    });
    await page.goto("/w/bubble?room=games&chat=full");
    await hydrated(page);
    const list = page.getByRole("list", { name: "Messages" });
    await expect(list.locator(":scope > li")).toHaveCount(40);
    const sizes = await list.evaluate((element) => ({ scroll: element.scrollHeight, client: element.clientHeight }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    const composer = page.getByRole("group", { name: "Message box" });
    const before = await box(composer);
    await list.evaluate((element) => {
      element.scrollTop = 0;
    });
    expect(await box(composer)).toEqual(before);
    // The document does not scroll and the box is the window's: the composer is in view, at 1280 by 600 as at any size.
    const layout = await box(page.locator("[data-chat-layout]"));
    expect(layout.y).toBe(0);
    expect(layout.y + layout.height).toBeLessThanOrEqual(600);
    await expect(composer).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(600);
  });

  test("passes axe at a computer's width, an account's and a guest's", async ({ page }) => {
    await logIn(page, "screen-axe");
    await open(page, { width: 1280, as: ACCOUNT, pinned: true });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("keeps the phone's layout, a guest's: the conversation first, no worlds, no side panel, axe clean", async ({
    page,
  }) => {
    await open(page, { width: 390, as: GUEST });
    await expect(worlds(page)).toBeHidden();
    await expect(info(page)).toBeHidden();
    await expect(roomsButton(page)).toBeVisible();
    expect((await box(page.getByRole("list", { name: "Messages" }))).x).toBeLessThan(40);
    expect(await sideways(page)).toBe(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page).toHaveScreenshot("chat-screen-phone.png");
  });

  test("keeps the phone's composer and quick actions inside the screen, an account's, and the people a press away", async ({
    page,
  }) => {
    await logIn(page, "screen-phone");
    await open(page, { width: 390, as: ACCOUNT });
    const message = await box(page.getByRole("group", { name: "Message box" }));
    const bar = await box(page.getByRole("toolbar", { name: "Quick actions" }));
    for (const each of [message, bar]) {
      expect(each.x).toBeGreaterThanOrEqual(0);
      expect(each.x + each.width).toBeLessThanOrEqual(390);
    }
    expect(await sideways(page)).toBe(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    // The info panel has no room on a phone: Who's here opens the people, each with its Message button.
    await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Who's here" }).click();
    const dialog = page.getByRole("dialog", { name: "Who's here" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Message/ }).first()).toBeVisible();
  });

  // DESIGN-SYSTEM.md fixes one breakpoint for the chat: 900 px, the phone layout. Each side of it, what is drawn.
  for (const width of [901, 1000]) {
    test(`draws the columns at ${String(width)} px, a computer's, and never scrolls sideways`, async ({ page }) => {
      await open(page, { width: width, as: GUEST });
      await expect(worlds(page)).toBeVisible();
      await expect(roomsNav(page)).toBeVisible();
      await expect(info(page)).toBeVisible();
      await expect(page.getByRole("list", { name: "Messages" })).toBeVisible();
      await expect(roomsButton(page)).toHaveCount(0);
      expect(await sideways(page)).toBe(0);
    });
  }

  for (const width of [899, 880]) {
    test(`draws the phone's pieces at ${String(width)} px: the conversation, the Rooms control, no columns`, async ({
      page,
    }) => {
      await open(page, { width: width, as: GUEST });
      await expect(worlds(page)).toBeHidden();
      await expect(info(page)).toBeHidden();
      await expect(roomsNav(page)).toBeHidden();
      await expect(roomsButton(page)).toBeVisible();
      await expect(page.getByRole("list", { name: "Messages" })).toBeVisible();
      expect(await sideways(page)).toBe(0);
    });
  }

  test("follows the window across the breakpoint, both ways", async ({ page }) => {
    await open(page, { width: 1000, as: GUEST });
    await expect(info(page)).toBeVisible();
    await page.setViewportSize({ width: 880, height: 900 });
    await expect(info(page)).toBeHidden();
    await expect(roomsButton(page)).toBeVisible();
    await page.setViewportSize({ width: 1000, height: 900 });
    await expect(info(page)).toBeVisible();
    await expect(roomsButton(page)).toHaveCount(0);
  });
});
