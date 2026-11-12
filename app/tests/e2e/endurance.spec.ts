import type { CDPSession } from "@playwright/test";
import { chain } from "../chain/rpcRoute.ts";
import { RECORDED_FILE } from "./deployed.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { logIn } from "./irc.ts";
import { gpuOf, heapOf } from "./sceneStage.ts";

// A long visit on the built site, logged in, back and forth through the galaxy, a system, a world, a realm, the full chat and the dock,
// Back and Forward, the palette, the passport and the Earth: no error, the plate and the dock drawn, no loader left; after a warm-up the
// heap, the DOM's nodes and listeners and the GPU's resources stay at their baseline.
test.describe.configure({ timeout: 1_800_000 });
test.use({ viewport: { width: 1728, height: 1080 } });
// The JIT is off: its compiled code fills the V8 heap round after round (about 0.2 MB a round, 14 rounds: code +2.1 MB, every object, string, closure
// and array flat within 1 %, heap snapshots of rounds 4 and 14) and would hide a real retention; with it off the heap is flat from round 2.
// (--single-process as the config has it in Claude Code's sandbox; test.use replaces the config's args.)
test.use({
  launchOptions: {
    args: [
      ...(process.env["SANDBOX_RUNTIME"] ? ["--single-process"] : []),
      "--js-flags=--no-turbofan --no-maglev --no-sparkplug",
    ],
  },
});

const ROUNDS = 10;
// Two rounds: the lazy chunks, the caches and the fonts a first visit loads are in by then.
const WARM = 2;
// A tenth over the baseline for the heap, the nodes and the listeners: a collection that has not run, a list as long as the day's lines.
const MARGIN = 1.1;
const SLOW = { timeout: 30_000 };
const REALM = "gnoland/blog";

const expand = (page: Page) => page.getByRole("button", { name: "Open the full chat" });
const shrink = (page: Page) => page.getByRole("button", { name: "Close the full chat" });
const control = (page: Page) => page.getByRole("button", { name: "Search", exact: true });
const field = (page: Page) => page.getByRole("searchbox", { name: "Search places" });

interface Counters {
  heap: number;
  documents: number;
  nodes: number;
  listeners: number;
  geometries: number;
  textures: number;
}

async function counters(page: Page, cdp: CDPSession): Promise<Counters> {
  const heap = await heapOf(cdp);
  const { documents, nodes, jsEventListeners } = await cdp.send("Memory.getDOMCounters");
  return { heap, documents, nodes, listeners: jsEventListeners, ...(await gpuOf(page)) };
}

/** No error page, no inline failure, no loader; the plate's words and the dock's chat drawn and shown when the page has them; no part of
 * the page left hidden by a motion stopped half way. */
async function sound(page: Page, step: string, { plate = true, dock = true } = {}) {
  await expect(page.getByRole("alert"), `${step}: an inline failure`).toHaveCount(0, SLOW);
  await expect(page.getByRole("status", { name: /^Loading/ }), `${step}: a loader stays`).toHaveCount(0, SLOW);
  await expect(page.getByText(/Something went wrong|Application Error/), `${step}: an error page`).toHaveCount(0);
  if (plate)
    await expect(page.getByRole("heading", { level: 1 }).first(), `${step}: the plate's words`).toBeVisible(SLOW);
  if (dock) {
    const live = page.locator("[data-chat-layout]:not([inert], [inert] *, [data-ghost] *)");
    await expect(live, `${step}: the dock`).toBeVisible(SLOW);
    await expect(live).toHaveCSS("opacity", "1");
    await expect(
      page.locator("[inert] [data-chat-layout], [data-chat-layout][inert], [data-ghost] [data-chat-layout]"),
      `${step}: a still copy stays`,
    ).toHaveCount(0, SLOW);
    await expect(page.getByRole("group", { name: "Message box" }), `${step}: the message box`).toBeVisible(SLOW);
  }
  const hidden = await page.evaluate(
    (parts) =>
      [...document.querySelectorAll(parts)]
        .filter((el) => {
          const s = getComputedStyle(el);
          return (
            s.visibility === "hidden" && el.closest("[aria-hidden]") === null && el.getAttribute("data-keep") === null
          );
        })
        .map((el) => `${el.tagName}.${el.className}`),
    dock ? "header, [data-dock], [data-chat-layout]" : "header",
  );
  expect(hidden, `${step}: parts left hidden`).toEqual([]);
}

/** A place by the palette: its words typed, the first answer chosen, the page's address as asked. */
async function viaPalette(page: Page, words: string, { pick, url }: { pick: RegExp; url: RegExp }) {
  await control(page).click();
  await expect(field(page)).toBeFocused();
  await field(page).fill(words);
  await page.getByRole("option", { name: pick }).first().click();
  await expect(page).toHaveURL(url, SLOW);
  await expect(page.getByRole("dialog", { name: "Search" })).toBeHidden();
}

async function round(page: Page) {
  await test.step("the galaxy", async () => {
    await page.getByRole("link", { name: "gnoworld" }).click();
    await expect(page).toHaveURL(/\/(\?.*)?$/, SLOW);
    await sound(page, "galaxy", { plate: false, dock: false });
  });
  await test.step("a system", async () => {
    await page.locator("a[href^='/s/']").first().dispatchEvent("click");
    await expect(page).toHaveURL(/\/s\/[^/]+$/, SLOW);
    await sound(page, "system", { dock: false });
  });
  await test.step("a world", async () => {
    await viaPalette(page, "bubb", { pick: /^Bubble/, url: /\/w\/bubble$/ });
    await sound(page, "world");
  });
  await test.step("a realm", async () => {
    await viaPalette(page, REALM, { pick: new RegExp(REALM), url: new RegExp(`/r/${REALM}$`) });
    await sound(page, "realm", { plate: false, dock: false });
  });
  await test.step("the full chat and back to the dock", async () => {
    await viaPalette(page, "bubb", { pick: /^Bubble/, url: /\/w\/bubble$/ });
    await sound(page, "world again");
    await page.getByRole("link", { name: /^Chat of/ }).click();
    await expect(shrink(page)).toBeVisible(SLOW);
    await page.goBack();
    await expect(expand(page)).toBeVisible(SLOW);
    await sound(page, "dock after Back");
    await page.goForward();
    await expect(shrink(page)).toBeVisible(SLOW);
    await shrink(page).click();
    await expect(expand(page)).toBeVisible(SLOW);
    await sound(page, "dock after shrink");
    await expand(page).click();
    await expect(shrink(page)).toBeVisible(SLOW);
    await shrink(page).click();
    await expect(expand(page)).toBeVisible(SLOW);
    await sound(page, "dock after a second trip");
  });
  await test.step("another world by the palette", async () => {
    await viaPalette(page, "govdao", { pick: /^GovDAO/i, url: /\/w\/govdao$/ });
    await sound(page, "another world");
  });
  await test.step("the passport, opened and closed", async () => {
    await page.getByRole("button", { name: /Your account/ }).click();
    await page.getByRole("menuitem", { name: "Passport" }).click();
    await expect(page.getByRole("dialog")).toBeVisible(SLOW);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden(SLOW);
    await sound(page, "after the passport");
  });
  await test.step("the Earth", async () => {
    await viaPalette(page, "> earth", { pick: /earth/i, url: /\/earth$/ });
    await sound(page, "Earth", { plate: false });
  });
}

test(`${String(ROUNDS)} rounds of a long visit leave no stuck screen and no leak`, async ({ page }) => {
  await page.route("**/worlds.json", (route) =>
    route.fulfill({ body: RECORDED_FILE, contentType: "application/json" }),
  );
  await chain(page, { [`gno.land/r/${REALM}`]: "# Blog", "gno.land/r/gov/dao": "# GovDAO" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await logIn(page, "endure");
  await page.goto("/?test-gpu");
  await hydrated(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Memory.getDOMCounters");
  const seen: Counters[] = [];
  for (let at = 1; at <= ROUNDS; at += 1) {
    await test.step(`round ${String(at)}`, () => round(page));
    // Read where every round ends: the galaxy, whose scene answers for the GPU's resources.
    await page.getByRole("link", { name: "gnoworld" }).click();
    await expect(page).toHaveURL(/\/(\?.*)?$/, SLOW);
    await expect(page.locator("canvas[data-scene='on']")).toBeAttached(SLOW);
    await page.waitForTimeout(1000);
    seen.push(await counters(page, cdp));
    console.log(`round ${String(at)}: ${JSON.stringify(seen.at(-1))}`);
  }
  const base = seen[WARM - 1];
  const last = seen.at(-1);
  if (base === undefined || last === undefined) throw new Error("no round was read");
  expect(last.heap, "the JS heap").toBeLessThanOrEqual(base.heap * MARGIN);
  expect(last.nodes, "the DOM's nodes").toBeLessThanOrEqual(base.nodes * MARGIN);
  expect(last.listeners, "the DOM's listeners").toBeLessThanOrEqual(base.listeners * MARGIN);
  expect(last.documents, "the documents").toBeLessThanOrEqual(base.documents);
  expect(last.geometries, "the GPU's geometries").toBeLessThanOrEqual(base.geometries);
  expect(last.textures, "the GPU's textures").toBeLessThanOrEqual(base.textures);
});
