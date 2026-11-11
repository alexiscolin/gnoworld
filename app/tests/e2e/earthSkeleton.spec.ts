import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onEarth, raw, spaceReady as sceneOn } from "./earthStage.ts";
import { expect, hydrated, test, type Page } from "./fixtures.ts";
import { bonesTurns, recordBones, stopBones } from "./smoothBones.ts";

// The skeletons' lines and state (2026-11-11), flow by flow: the Earth's page to the full chat (a skeleton left over a planet that stands), and
// the arrival at the Earth from the universe and from its system (the lines turn only as the planet does). One JSON line a flow to `SKEL_OUT`.
declare const process: { env: Record<string, string | undefined> };
const OUT = process.env["SKEL_OUT"] ?? join(tmpdir(), "earthSkeleton.jsonl");
const SLOW = { timeout: 90_000 };
test.use({ viewport: { width: 1366, height: 768 } });
test.describe.configure({ mode: "default", timeout: 300_000 });

async function flow(page: Page, name: string, go: () => Promise<void>) {
  await recordBones(page);
  await go();
  await flowEnd(page, name);
}

async function flowEnd(page: Page, name: string) {
  const frames = await stopBones(page);
  const gains = frames.flatMap(({ bones }) => bones.map(({ gain }) => gain));
  const last = frames.slice(-Math.ceil(frames.length / 5));
  const summary = {
    name,
    frames: frames.length,
    withSkeleton: frames.filter(({ bones }) => bones.length > 0).length,
    maxGain: Math.max(0, ...gains),
    lastFifth: last
      .map(({ t, bones, shown }) => ({
        t: Math.round(t),
        gains: bones.map((b) => [b.at.map(Math.round), +b.gain.toFixed(2)]),
        shown,
      }))
      .filter((_, i) => i % 6 === 0),
    turns: bonesTurns(frames),
  };
  appendFileSync(OUT, `${JSON.stringify(summary)}\n`);
  appendFileSync(`${OUT}.frames`, `${JSON.stringify({ name, frames })}\n`);
}

test("9a the Earth's page to the full chat: which skeleton stays", async ({ page }) => {
  page.on("console", (m) => {
    if (m.text().startsWith("DBG")) appendFileSync(`${OUT}.dbg`, `${m.text()}\n`);
  });
  await onEarth(page, { motion: true, ticking: true, joined: false });
  await hydrated(page);
  await sceneOn(page);
  const chat = page.getByRole("navigation", { name: "Views" }).locator("a[href*='chat=full']");
  await expect(chat).toBeVisible(SLOW);
  await flow(page, "9a", async () => {
    await chat.click();
    await page.waitForTimeout(6000);
  });
});

// The arrival at the Earth by its link, from the page at `path` (the system's or the universe's).
const arrival = (title: string, flowName: string, path: string) => {
  test(title, async ({ page }) => {
    await onEarth(page, { motion: true, ticking: true, path, joined: false });
    await hydrated(page);
    await sceneOn(page);
    await flow(page, flowName, async () => {
      await page.locator("a[href='/earth']").first().dispatchEvent("click");
      await expect(page).toHaveURL(/\/earth/, SLOW);
      await page.waitForTimeout(9000);
    });
  });
};
arrival("system to the Earth", "system-to-earth", "/?test-gpu");
arrival("universe to the Earth", "universe-to-earth", "/universe?test-gpu");
arrival("a world to the Earth", "world-to-earth", "/w/bubble?test-gpu");

test("a reload of the Earth's page, from its first frame", async ({ page }) => {
  const { socket } = await onEarth(page, { motion: true, ticking: true, joined: false });
  await recordBones(page);
  await expect
    .poll(() => {
      try {
        return socket().url().length > 0;
      } catch {
        return false;
      }
    }, SLOW)
    .toBe(true);
  // Lines from far countries, so the page's planet has signs to turn to (the lean toward the eye, D13916).
  for (const [id, country] of [
    ["s1", "JP"],
    ["s2", "BR"],
    ["s3", "AU"],
  ] as const) {
    socket().send(raw({ id, text: `from ${country}`, country, from: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5" }));
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(12_000);
  await flowEnd(page, "reload-earth");
});
