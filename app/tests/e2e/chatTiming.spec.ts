import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { record, stop } from "./smoothness.ts";

// The chat's timing against the camera (2026-11-11): per frame, whether the camera is flying and the dock's opacity and place, across a
// flight to a world's page. One JSON line a flow to `CHAT_OUT`: the chat must not show before the flight has ended.
declare const process: { env: Record<string, string | undefined> };
const OUT = process.env["CHAT_OUT"] ?? join(tmpdir(), "chatTiming.jsonl");
const SLOW = { timeout: 90_000 };
const WATCH = ["#chat", "[data-chat-layout]", "#chat header", "[data-look='plate']", "header"];
test.use({ viewport: { width: 1366, height: 768 } });
test.describe.configure({ mode: "default", timeout: 300_000 });

const sceneOn = (page: Page) =>
  page.waitForFunction(() => Reflect.get(globalThis, "__gnoworldSpace") !== undefined, undefined, SLOW);

test("home to a world's page: the chat shows with the arrival, not before", async ({ page }) => {
  await page.goto("/?test-gpu");
  await hydrated(page);
  await sceneOn(page);
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    const log: [number, string, string][] = [];
    Reflect.set(globalThis, "__flownLog", log);
    let last = "";
    new MutationObserver(() => {
      const box = document.querySelector<HTMLElement>("[data-globe]");
      const now = box === null ? "none" : (box.dataset["flown"] ?? "");
      if (now !== last) log.push([Math.round(performance.now()), "box", now]);
      last = now;
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-flown"] });
  });
  await record(page, WATCH);
  await page.locator("a[href='/w/bubble']").first().dispatchEvent("click");
  await expect(page.locator("[data-look='plate']")).toBeVisible(SLOW);
  await page.waitForTimeout(9000);
  const raw = await stop(page);
  const t0 = raw.frames[0]?.t ?? 0;
  const rows = raw.frames.map((f) => ({
    t: Math.round(f.t - t0),
    abs: Math.round(f.t),
    flying: f.flying,
    chat: f.watched["#chat"]?.seen,
    layout: f.watched["[data-chat-layout]"]?.seen,
    head: f.watched["#chat header"]?.seen,
    plate: f.watched["[data-look='plate']"]?.seen,
  }));
  appendFileSync(OUT, `${JSON.stringify({ name: "home-to-world", rows })}\n`);
  const log = await page.evaluate(() => Reflect.get(globalThis, "__flownLog") as [number, string, string][]);
  appendFileSync(OUT, `${JSON.stringify({ name: "flown", log: log })}\n`);
  // The flight's span: from the box's "flying" to its "landed" (the arrival's start), on the page's own clock.
  const flights = log;
  const from = flights.find(([, , state]) => state === "flying")?.[0] ?? 0;
  const to = flights.find(([at, , state]) => state === "landed" && at > from)?.[0] ?? Infinity;
  const seen = rows.filter(
    (r) => r.abs >= from && r.abs < to - 100 && ((r.chat ?? 0) > 0.01 || (r.layout ?? 0) > 0.01),
  );
  appendFileSync(OUT, `${JSON.stringify({ name: "span", from, to, seen: seen.length })}\n`);
  expect.soft(seen.length, "the chat is visible while the camera flies").toBe(0);
});
