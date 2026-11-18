import type { Locator, Page } from "@playwright/test";
import { expect, hydrated, test } from "./fixtures.ts";
import { scrolling, word } from "./chat.ts";
import { logIn } from "./irc.ts";
import { live, room, T } from "./scriptedRoom.ts";
import { scriptedErgo, type HistoryLine } from "./scripted.ts";

// A room opens at its newest line and stays there as that line's card comes late; a reader who scrolled up is left where they are.
// The list's scroll origin is its foot (CSS), the same in every engine: `scrollTop` is 0 at the newest line and below 0 above it.
const MARKETS = {
  source: "CoinGecko",
  updated: new Date().toISOString(),
  tokens: [{ symbol: "GNOT", usd: 0.43, change24h: -3 }],
};
const HISTORY: readonly HistoryLine[] = [
  ...Array.from({ length: 30 }, (_, i): HistoryLine => [`h${String(i)}`, T(i), `line number ${String(i)}`]),
  ["card", T(31), "💹 Market prices"],
];
const gap = (list: Locator) => scrolling(list).evaluate((box) => Math.round(-box.scrollTop));
// Where the room's first line stands: a reader who scrolled up keeps it still.
const firstAt = (list: Locator) =>
  list
    .locator(":scope > li")
    .first()
    .evaluate((line) => Math.round(line.getBoundingClientRect().top));

test("a room opens at its end and stays there as a late card comes in", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((done) => {
    release = done;
  });
  await page.route("**/markets.json", async (route) => {
    await held;
    await route.fulfill({ json: MARKETS, headers: { "access-control-allow-origin": "*" } });
  });
  await page.route("**/api/markets/history", (route) => route.fulfill({ status: 404, json: { error: "not_ready" } }));
  const { ergo } = await room(page, { history: HISTORY });
  const list = page.getByRole("list", { name: "Messages" });
  await expect.poll(() => gap(list)).toBeLessThan(4);
  const before = await list.evaluate((box) => box.scrollHeight);
  release();
  await expect(page.locator('[data-market-card] [data-token="GNOT"]')).toBeVisible();
  expect(await list.evaluate((box) => box.scrollHeight)).toBeGreaterThan(before);
  await expect.poll(() => gap(list)).toBeLessThan(4);
  // Scrolled up, a line that comes moves nothing the reader sees.
  await scrolling(list).evaluate(async (box) => {
    box.scrollTop = -box.scrollHeight;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  const first = await firstAt(list);
  ergo().send(live("later", T(40), { text: "a later line" }));
  await expect(page.getByText("a later line")).toBeAttached();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  expect(await firstAt(list)).toBe(first);
});

// In the page: the lines at `first` grow by 200 px, then those at `then` (-1 is the newest) once the list has moved to its end for
// the first and before that move's scroll event; the list's height once all is drawn.
const grownApart = (list: Locator, first: readonly number[], then: readonly number[]) =>
  list.evaluate(
    async (box, [now, later]) => {
      const frame = () => new Promise((done) => requestAnimationFrame(done));
      const grow = (at: number) => {
        const line = Array.from(box.children).at(at);
        if (line instanceof HTMLElement) line.style.setProperty("min-block-size", "200px");
      };
      now?.forEach(grow);
      await frame();
      // After this frame's ResizeObserver, before the next frame's scroll event.
      await new Promise((done) => setTimeout(done, 0));
      later?.forEach(grow);
      await frame();
      await frame();
      await frame();
      return box.scrollHeight;
    },
    [first, then],
  );

// Cards grow after the lines are drawn (a phone's top worlds and proposals filling 60 to 300 ms later): the room ends at its end,
// whatever grows and wherever, the lines above or the newest one, a frame apart or together.
test("a room stays at its end when cards grow after its lines, above and at the newest line", async ({ page }) => {
  await room(page, { history: HISTORY.slice(0, 30) });
  const list = page.getByRole("list", { name: "Messages" });
  await expect.poll(() => gap(list)).toBeLessThan(4);
  expect(await grownApart(list, [5], [10])).toBeGreaterThan(400);
  expect(await gap(list)).toBeLessThan(4);
  await grownApart(list, [6], [-1]);
  expect(await gap(list)).toBeLessThan(4);
});

// A reader who wheels up keeps their place as the newest line grows under them, and as a line grows above them.
test("a reader who scrolls up by the wheel keeps their place as a card grows", async ({ page }) => {
  await room(page, { history: HISTORY.slice(0, 30) });
  const list = page.getByRole("list", { name: "Messages" });
  await expect.poll(() => gap(list)).toBeLessThan(4);
  await list.hover();
  await page.mouse.wheel(0, -150);
  // The wheel's scroll is animated in some engines: wait for it to stop before reading the place.
  await expect
    .poll(async () => {
      const first = await gap(list);
      await page.waitForTimeout(200);
      return first > 100 && first === (await gap(list));
    })
    .toBe(true);
  const newest = list.locator(":scope > li").last();
  const at = () => newest.evaluate((line) => Math.round(line.getBoundingClientRect().top));
  const readerAt = () =>
    list
      .locator(":scope > li")
      .nth(24)
      .evaluate((line) => Math.round(line.getBoundingClientRect().top));
  const before = await readerAt();
  await list.evaluate(async (box) => {
    const line = box.children[box.children.length - 1];
    if (line instanceof HTMLElement) line.style.setProperty("min-block-size", "300px");
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  expect(await at()).toBeGreaterThan(0);
  // Within a pixel: the page puts a scroll on its device pixels.
  expect(Math.abs((await readerAt()) - before)).toBeLessThanOrEqual(1);
  await list.evaluate(async (box) => {
    const line = box.children[2];
    if (line instanceof HTMLElement) line.style.setProperty("min-block-size", "300px");
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  expect(Math.abs((await readerAt()) - before)).toBeLessThanOrEqual(1);
});

// The box shrinks (a six-line draft grows the composer, 72 px here, a spacer under the list): the bottom origin would carry a
// reader's lines up with the box's foot. In the page: the box is shrunk, and the newest line grown too when `card` says so, in one
// frame; the box's height lost and the reader's line moved, once the frame is drawn.
const shrunk = (list: Locator, at: number, card: boolean) =>
  scrolling(list).evaluate(
    async (box, [nth, grow]) => {
      const frame = () => new Promise((done) => requestAnimationFrame(done));
      const reader = box.querySelectorAll("ol > li")[nth];
      const top = () => Math.round(reader?.getBoundingClientRect().top ?? 0);
      const [height, was] = [box.clientHeight, top()];
      const spacer = document.createElement("div");
      spacer.style.setProperty("block-size", "72px");
      box.parentElement?.after(spacer);
      const last = box.querySelector("ol")?.lastElementChild;
      if (grow && last instanceof HTMLElement) last.style.setProperty("min-block-size", "300px");
      await frame();
      await frame();
      await frame();
      return { lost: height - box.clientHeight, moved: top() - was };
    },
    [at, card] as const,
  );

// A room opened, its reader scrolled 300 px up from the end, the scroll told and the place noted.
async function readerUp(page: Page) {
  await room(page, { history: HISTORY.slice(0, 30) });
  const list = page.getByRole("list", { name: "Messages" });
  await expect.poll(() => gap(list)).toBeLessThan(4);
  await scrolling(list).evaluate(async (box) => {
    box.scrollTop = -300;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  return list;
}

for (const [name, card] of [
  ["as the box shrinks under them", false],
  ["as the box shrinks and the newest line grows in one frame", true],
] as const) {
  test(`a reader scrolled up keeps their place ${name}`, async ({ page }) => {
    const { lost, moved } = await shrunk(await readerUp(page), 20, card);
    expect(lost).toBeGreaterThan(60);
    expect(Math.abs(moved)).toBeLessThanOrEqual(1);
  });
}

test("a reader scrolling as a card grows keeps their place: the scroll is told in the frame of the growth", async ({
  page,
}) => {
  const list = await readerUp(page);
  const moved = await scrolling(list).evaluate(async (box) => {
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    const reader = box.querySelectorAll("ol > li")[20];
    const last = box.querySelector("ol")?.lastElementChild;
    const was = reader?.getBoundingClientRect().top ?? 0;
    // The reader scrolls 100 px up and the newest line grows 268 px, both before the frame: the scroll event comes first.
    box.scrollTop -= 100;
    if (last instanceof HTMLElement) last.style.setProperty("min-block-size", "300px");
    await frame();
    await frame();
    await frame();
    // The scroll alone moves the line down by 100.
    return Math.round((reader?.getBoundingClientRect().top ?? 0) - was);
  });
  expect(Math.abs(moved - 100)).toBeLessThanOrEqual(1);
});

// At the end the foot holds the reader: a box that shrinks moves nothing by script.
test("a reader at the end stays at the end as the box shrinks", async ({ page }) => {
  await room(page, { history: HISTORY.slice(0, 30) });
  const list = page.getByRole("list", { name: "Messages" });
  await expect.poll(() => gap(list)).toBeLessThan(4);
  const { lost } = await shrunk(list, 29, false);
  expect(lost).toBeGreaterThan(60);
  expect(await gap(list)).toBeLessThan(4);
});

// A list shown again after it had no height (a phone's panel) is at its end again: a hidden box loses its place, and its place is its foot.
test("a room shown again after its list had no height is at its end", async ({ page }) => {
  await room(page, { history: HISTORY.slice(0, 30) });
  const list = page.locator('ol[aria-label="Messages"]');
  await expect.poll(() => gap(list)).toBeLessThan(4);
  await list.evaluate(async (box) => {
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    const region = box.closest("[data-chat-layout]");
    if (!(region instanceof HTMLElement)) throw new Error("no chat layout");
    region.style.setProperty("display", "none");
    await frame();
    await frame();
    region.style.removeProperty("display");
    await frame();
    await frame();
  });
  await expect.poll(() => gap(list)).toBeLessThan(4);
});

// The net leaves the one exception alone: an account's room with unread lines opens on its New line and stays there.
test("a room opened on its New line stays there once it is quiet", async ({ page }) => {
  const address = await logIn(page, word("arrive"));
  await room(page, { me: address, history: HISTORY.slice(0, 30), read: T(5) });
  const list = page.getByRole("list", { name: "Messages" });
  const fromTop = () =>
    list.evaluate((box) => {
      const mark = box.querySelector(":scope > li[data-new]");
      const view = box.parentElement;
      return mark === null || view === null
        ? -1
        : Math.abs(Math.round(mark.getBoundingClientRect().top - view.getBoundingClientRect().top));
    });
  // Within a pixel: the page puts a scroll on its device pixels.
  await expect.poll(fromTop).toBeLessThanOrEqual(1);
  await page.waitForTimeout(600);
  expect(await fromTop()).toBeLessThanOrEqual(1);
  expect(await gap(list)).toBeGreaterThan(100);
});

// Until its history came a room shows the chat's skeleton, never the empty room's words; then its lines, at their end.
test("a room shows a skeleton until its history came, then its lines at their end", async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((done) => {
    release = done;
  });
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, "guest-zzzzzz", { history: HISTORY.slice(0, 30), historyAfter: held });
  });
  await page.goto("/w/bubble?room=games&chat=full");
  await hydrated(page);
  await expect(
    page.locator('[data-chat-state="connected"] [aria-busy="true"] [data-shape="disc"]').first(),
  ).toBeAttached();
  await expect(page.getByText("No messages yet.")).toHaveCount(0);
  release();
  const list = page.getByRole("list", { name: "Messages" });
  await expect(list.locator(":scope > li").first()).toBeAttached();
  await expect.poll(() => gap(list)).toBeLessThan(4);
  await expect(page.locator('[aria-busy="true"] [data-shape="disc"]')).toHaveCount(0);
});

// A room that opens with a card still reading its data shows once, whole: each height its list had while in view, frame by frame.
test("a room that opens with a card shows its lines once, the card filled, at their end", async ({ page }) => {
  await page.addInitScript(() => {
    const heights = new Set<number>();
    Object.assign(window, { heights });
    const look = () => {
      const box = document.querySelector<HTMLElement>('ol[aria-label="Messages"]');
      const scroller = box?.parentElement;
      if (box && scroller && box.children.length > 0 && !scroller.hasAttribute("data-awaiting"))
        heights.add(scroller.scrollHeight);
      requestAnimationFrame(() => setTimeout(look, 0));
    };
    look();
  });
  await page.route("**/markets.json", async (route) => {
    await new Promise((done) => setTimeout(done, 60));
    await route.fulfill({ json: MARKETS, headers: { "access-control-allow-origin": "*" } });
  });
  await page.route("**/api/markets/history", (route) => route.fulfill({ status: 404, json: { error: "not_ready" } }));
  await room(page, { history: HISTORY });
  await expect(page.locator('[data-market-card] [data-token="GNOT"]')).toBeVisible();
  const list = page.getByRole("list", { name: "Messages" });
  await expect.poll(() => gap(list)).toBeLessThan(4);
  expect(await page.evaluate(() => (Reflect.get(window, "heights") as Set<number>).size)).toBe(1);
});

// A history that never comes (Ergo refused the room, or answers nothing) leaves no skeleton for good: the empty room's words after 10 s.
test("a room whose history never comes says it holds no message after 10 s", async ({ page }) => {
  await page.clock.install();
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, "guest-zzzzzz", { historyAfter: new Promise<void>(() => undefined) });
  });
  await page.goto("/w/bubble?room=games&chat=full");
  await hydrated(page);
  const skeleton = page.locator('[data-chat-state="connected"] [aria-busy="true"] [data-shape="disc"]');
  await expect(skeleton.first()).toBeAttached();
  await page.clock.fastForward(9_000);
  await expect(page.getByText("No messages yet.")).toHaveCount(0);
  await page.clock.fastForward(1_500);
  await expect(page.getByText("No messages yet.")).toBeVisible();
  await expect(skeleton).toHaveCount(0);
});
