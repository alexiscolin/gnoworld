import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adena } from "./adena.ts";
import { callWallet, connect, REALM, writeChain } from "./callCard.ts";
import { open } from "./chatScreenOpen.ts";
import { word } from "./chat.ts";
import { onEarth, spaceReady as sceneOn } from "./earthStage.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { analyse, continuity, odd } from "./smoothAnalysis.ts";
import { record, stop, type Raw } from "./smoothness.ts";

// Smoothness: each flow of a reader's first minutes recorded frame by frame (smoothness.ts), the numbers kept in the file
// `SMOOTH_OUT` names (one JSON line a flow) for the comparison of two trees. It fails on a jump or a bounce of what moves; a stall or a long
// frame is a number to compare, as the software GPU's absolute times are not a budget.
declare const process: { env: Record<string, string | undefined> };
const OUT = process.env["SMOOTH_OUT"] ?? join(tmpdir(), "smoothness.jsonl");
const SLOW = { timeout: 90_000 };
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
// One flow at a time, in this order, a failed one not stopping the next: two flows never share the machine's frames.
test.describe.configure({ mode: "default", timeout: 420_000 });
// Small enough for the software GPU to draw a few frames a second: at 1440x900 about one), yet over the phone width (899 px, under which the scene waits for a press.
test.use({ viewport: { width: 960, height: 560 } });

const wait = (page: Page, ms: number) => page.waitForTimeout(ms);

// Records `go` (the flow's name, then the selectors to watch), then writes its numbers.
async function flow(page: Page, [name = "", ...watch]: string[], go: () => Promise<void>) {
  await record(page, watch);
  await go();
  const raw = await stop(page);
  const report = analyse(raw);
  appendFileSync(OUT, `${JSON.stringify({ name, report })}\n`);
  appendFileSync(`${OUT}.long`, `${JSON.stringify({ name, long: raw.long })}\n`);
  appendFileSync(`${OUT}.frames`, `${JSON.stringify({ name, raw })}\n`);
  if (name.includes("earth")) expect.soft(report.turns, `${name}: a whole turn of the Earth`).toBeLessThan(1);
  expect.soft(report.skeleton.lastSecond, `${name}: a skeleton over a planet that is ready`).toBe(0);
  expect.soft(odd(report), `${name}: jumps and bounces ${JSON.stringify(report, null, 1).slice(0, 3000)}`).toBe(0);
}

test("the measure sees a planted jump, a bounce and a stall, and none in an eased motion", () => {
  const times = Array.from({ length: 40 }, (_, i) => i * 16);
  const eased = times.map((_, i) => 1 - Math.exp(-i / 8));
  expect(continuity(times, eased, { floor: 0.01 })).toEqual({ jumps: [], bounces: [] });
  expect(
    continuity(
      times,
      eased.map((v, i) => (i === 20 ? v + 0.5 : v)),
      { floor: 0.01 },
    ).jumps.length,
  ).toBeGreaterThan(0);
  expect(
    continuity(
      times,
      eased.map((v, i) => (i > 20 ? v - 0.1 * (i - 20) : v)),
      { floor: 0.01 },
    ).bounces.length,
  ).toBeGreaterThan(0);
  // A step over a stall is not judged: the stall drew none of it; the same step in a frame of its own is a jump.
  const stalled = times.map((t, i) => (i > 20 ? t + 300 : t));
  const stepped = eased.map((v, i) => (i > 20 ? v + 0.5 : v));
  expect(continuity(stalled, stepped, { floor: 0.01, unseen: 32 }).jumps).toEqual([]);
  expect(continuity(times, stepped, { floor: 0.01, unseen: 32 }).jumps.length).toBeGreaterThan(0);
  // The Earth's facing comes in degrees: 30 degrees turned slowly is no bounce and no whole turn.
  const turning: Raw = {
    frames: times.map((t, i) => ({ t, lat: 10, lon: i * 0.75, earthShown: true, watched: {} })),
    long: [],
    shifts: [],
  };
  expect(analyse(turning).lon).toEqual({ jumps: [], bounces: [] });
  expect(analyse(turning).turns).toBeLessThan(0.1);
  // A camera that jumps under the opaque full chat is not seen; the same jump uncovered is one.
  const posed = (covered: boolean): Raw => ({
    frames: times.map((t, i) => ({
      t,
      eye: [i < 20 ? i : i + 1000, 0, 0],
      covered: covered && i >= 19 && i <= 21,
      watched: {},
    })),
    long: [],
    shifts: [],
  });
  expect(analyse(posed(true)).eye?.jumps).toEqual([]);
  expect(analyse(posed(false)).eye?.jumps.length).toBeGreaterThan(0);
  // What is seen is judged: an element at 1 under a hidden parent shows nothing; a swap for another element in sight is judged.
  const part = (seen: number, left: number, id: number) => ({
    opacity: 1,
    seen,
    scale: 1,
    x: 0,
    y: 0,
    left,
    width: 10,
    id,
  });
  const watched = (at: (i: number) => ReturnType<typeof part>): Raw => ({
    frames: times.map((t, i) => ({ t, watched: { "#p": at(i) } })),
    long: [],
    shifts: [],
  });
  expect(
    analyse(watched((i) => part(i < 20 ? 0 : Math.min(1, (i - 19) / 10), 0, 1))).watched["#p"]?.opacity.jumps,
  ).toEqual([]);
  expect(
    analyse(watched((i) => part(1, i < 20 ? 100 : 300, i < 20 ? 1 : 2))).watched["#p"]?.left.jumps.length,
  ).toBeGreaterThan(0);
  const raw: Raw = { frames: times.map((t, i) => ({ t: i > 20 ? t + 100 : t, watched: {} })), long: [], shifts: [] };
  expect(analyse(raw).stalls.count).toBe(1);
});

test("1 home's first seconds", async ({ page }) => {
  await page.goto("/?test-gpu");
  await hydrated(page);
  await flow(page, ["1-home"], async () => {
    await sceneOn(page);
    await wait(page, 4000);
  });
});

// Up one page by the router's own history, so the page is not loaded again and the recording goes on.
const up = (page: Page) =>
  page.evaluate(() => {
    history.back();
  });

test("2 the flight home, a world's page, and back up", async ({ page }) => {
  await page.goto("/?test-gpu");
  await hydrated(page);
  await sceneOn(page);
  await flow(page, ["2-flight-world", "[data-look='plate']"], async () => {
    await page.locator("a[href='/w/bubble']").first().dispatchEvent("click");
    await expect(page.locator("[data-look='plate']")).toBeVisible(SLOW);
    await wait(page, 5000);
    await up(page);
    await wait(page, 6000);
  });
});

test("3 the galaxy, dragged", async ({ page }) => {
  await page.goto("/universe?test-gpu");
  await hydrated(page);
  await sceneOn(page);
  await flow(page, ["3-galaxy"], async () => {
    await wait(page, 2000);
    await page.mouse.move(480, 280);
    await page.mouse.down();
    // A hand's drag, a step a frame: twenty moves sent at once land in one frame after the press's, and the scene follows the hand there.
    for (let step = 1; step <= 20; step += 1) {
      await page.mouse.move(480 + 8 * step, 280 + 2 * step);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
    }
    await page.mouse.up();
    await wait(page, 4000);
  });
});

// The views' pill: Chat is its last link, the planet's page its third level.
const views = (page: Page) => page.getByRole("navigation", { name: "Views" });
const PILL = "nav[aria-label='Views'] > span:first-child";

test("4 a world's page: the chat full and back, the pill gliding", async ({ page }) => {
  await open(page, { width: 1366, as: ACCOUNT, height: 768, full: false, query: "&test-gpu" });
  await sceneOn(page);
  await flow(
    page,
    ["4-chat-full", PILL, "nav[aria-label='Views'] a[href*='chat=full']", "nav[aria-label='Views']"],
    async () => {
      await views(page).locator("a[href*='chat=full']").click();
      await wait(page, 3500);
      await views(page)
        .getByRole("link", { name: /^world/i })
        .click();
      await wait(page, 3500);
    },
  );
});

// The views' bar and its pill with no scene: the page at the browser's own 60 frames a second, where a transition is read whole (on the
// software GPU the scene's frames draw it in a few).
const BAR = "nav[aria-label='Views']";
async function barAndPill(page: Page, name: string) {
  await flow(page, [`${name}-to-chat`, PILL, BAR], async () => {
    await views(page).locator("a[href*='chat=full']").click();
    await wait(page, 2000);
  });
  // In the full chat each level's name is folded whole, at every width (under 1340 px the word beside it is hidden).
  const widths = await views(page)
    .locator("a .truncate")
    .evaluateAll((names) => names.map((each) => each.getBoundingClientRect().width));
  expect(
    widths.filter((width) => width > 0.5),
    `${name}: the names folded in the full chat`,
  ).toEqual([]);
  // The world's link by its address: under 1340 px its word is hidden, and its folded name says nothing yet.
  await flow(page, [`${name}-to-page`, PILL, BAR], async () => {
    await views(page).locator("a[href='/w/bubble']").click();
    await wait(page, 2000);
  });
}

for (const width of [1366, 1280])
  test(`4b a world's page with no scene at ${String(width)} px: the chat full and back, the bar and the pill gliding`, async ({
    page,
  }) => {
    await open(page, { width, as: ACCOUNT, height: 768, full: false });
    await wait(page, 1500);
    await barAndPill(page, `4b-world-${String(width)}`);
  });

test("5 the plate: a card alone, closed; Try it's tabs", async ({ page }) => {
  await adena(page);
  await callWallet(page, {});
  await writeChain(page, { landing: "now", fees: "rows" });
  await connect(page);
  await page.goto(`/r/${REALM.slice("gno.land/r/".length)}`);
  await hydrated(page);
  await expect(page.getByRole("tab", { name: /^Read/ })).toBeVisible(SLOW);
  await wait(page, 2000);
  await flow(page, ["5-plate", "#functions"], async () => {
    await page.getByRole("button", { name: "Expand Try it" }).click();
    await wait(page, 1500);
    await page.getByRole("tab", { name: /^Write/ }).click();
    await wait(page, 1000);
    await page.getByRole("tab", { name: /^Read/ }).click();
    await wait(page, 1000);
    await page.getByRole("button", { name: "Close Try it" }).click();
    await wait(page, 1500);
  });
});

test("6 the composer: a line with marks, sent", async ({ page }) => {
  await open(page, { width: 1366, as: ACCOUNT, height: 768, full: false, query: "&test-gpu" });
  await sceneOn(page);
  await wait(page, 2000);
  const field = page.getByRole("textbox", { name: "Message #games" });
  await flow(page, ["6-composer"], async () => {
    await field.click();
    await field.pressSequentially("hello **bold** and _slanted_ with `code` words", { delay: 30 });
    await wait(page, 500);
    await page.getByRole("button", { name: "Send" }).click();
    await wait(page, 2000);
  });
});

test("6b the bubble on the Earth", async ({ page }) => {
  const { socket } = await onEarth(page, { me: ACCOUNT, motion: true, ticking: true, joined: false });
  await sceneOn(page);
  await wait(page, 6000);
  await flow(page, ["6b-earth-bubble"], async () => {
    socket().send(
      `@msgid=b1;time=2026-11-02T21:30:00.000Z;account=${ACCOUNT};+gnoworld/country=JP :${ACCOUNT}!u@h PRIVMSG #earth :konnichiwa`,
    );
    await wait(page, 7000);
  });
});

// The + is an account's: the page logs in for real (a scripted Ergo alone leaves it a guest), then opens the docked chat.
test("7 a dialog, open and closed (poll)", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await logIn(page, word("poll"));
  await page.goto("/w/bubble?room=games&test-gpu");
  await hydrated(page);
  await sceneOn(page);
  await wait(page, 2000);
  await flow(page, ["7-dialog", "[role='dialog']"], async () => {
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("menuitem", { name: "Poll" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await wait(page, 1500);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await wait(page, 1000);
  });
});

test("8 the dive into the Earth's page and out, lines from far countries during and after", async ({ page }) => {
  const { socket, sent } = await onEarth(page, {
    me: ACCOUNT,
    motion: true,
    ticking: true,
    path: "/?test-gpu",
    joined: false,
  });
  await hydrated(page);
  await sceneOn(page);
  await wait(page, 4000);
  const say = (id: string, text: string, country: string) => {
    socket().send(
      `@msgid=${id};time=2026-11-02T21:30:00.000Z;account=${ACCOUNT};+gnoworld/country=${country} :${ACCOUNT}!u@h PRIVMSG #earth :${text}`,
    );
  };
  await flow(page, ["8-earth-dive"], async () => {
    await page.locator("a[href='/earth']").first().dispatchEvent("click");
    // The home opens no chat: the Earth's page joins #earth as the dive comes, and its first line is said once it has.
    await expect.poll(() => sent.some((line) => line.startsWith("JOIN #earth")), SLOW).toBe(true);
    say("d1", "from Japan, in the dive", "JP");
    await wait(page, 3000);
    say("d2", "from Brazil, in the dive", "BR");
    await expect(page).toHaveURL(/\/earth/, SLOW);
    await wait(page, 5000);
    say("d3", "from Australia, after it", "AU");
    await wait(page, 6000);
    const out = page.locator("a[href^='/s/']").first();
    if ((await out.count()) > 0) await out.dispatchEvent("click");
    else await up(page);
    say("d4", "from Japan, going out", "JP");
    await wait(page, 6000);
  });
});

test("9 the Earth's page to the full chat and back, the pill gliding, the Earth kept", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await onEarth(page, { me: ACCOUNT, motion: true, ticking: true, joined: false });
  await hydrated(page);
  await sceneOn(page);
  // The header stands hidden till the Earth's page is drawn: how long that takes is a number to compare.
  const began = Date.now();
  await expect(views(page)).toBeVisible({ timeout: 60_000 });
  appendFileSync(`${OUT}.extra`, `${JSON.stringify({ name: "9-header-visible-ms", ms: Date.now() - began })}\n`);
  const links = await views(page)
    .locator("a")
    .evaluateAll((all) => all.map((one) => one.getAttribute("href")));
  expect(links.join(" "), "the views' links on the Earth's page").toContain("chat=full");
  await flow(page, ["9a-earth-to-chat", PILL], async () => {
    await views(page).locator("a[href*='chat=full']").click();
    await wait(page, 4000);
  });
  await flow(page, ["9b-chat-to-earth", PILL], async () => {
    await views(page)
      .getByRole("link", { name: /^world/i })
      .click();
    await wait(page, 4000);
  });
});
