import { readFileSync } from "node:fs";
import { expect, test, type Page } from "./fixtures.ts";

const RECORDED = readFileSync(new URL("../recordedWorlds.json", import.meta.url), "utf8");

// The loader comes before the interface (SpaceLoader.tsx): on a page the host writes no HTML for (the fallback, which has no loader of its own), the
// header and the column must not show while the route waits for its data and before the loader stands over them. The worlds' file is held back,
// as a slow link holds it; every frame from the first paint to the loader's first standing is read, with scripts on.
test.use({ viewport: { width: 1440, height: 900 } });
const HELD_MS = 2500;

async function watch(page: Page, path: string) {
  // A 10 Mbit/s link with 40 ms of latency: on a fast one the route mounts before the shell's own timer ends.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 40,
    downloadThroughput: (10 * 1024 * 1024) / 8,
    uploadThroughput: 131072,
  });
  // A slow phone-class processor: the route takes longer to mount than the shell's own 350 ms hold.
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await page.route("**/worlds.json", async (route) => {
    await new Promise((done) => setTimeout(done, HELD_MS));
    await route.fulfill({ body: RECORDED, contentType: "application/json" });
  });
  await page.addInitScript(() => {
    const opacityOf = (el: Element | null): number => {
      let opacity = el === null ? 0 : 1;
      for (let node = el; node !== null; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
      return opacity;
    };
    const seen = (el: Element | null): boolean => opacityOf(el) > 0.05;
    const bad: number[] = [];
    let stood = false;
    Reflect.set(globalThis, "__bad", bad);
    const poll = () => {
      const loader = document.querySelector("[data-loader]");
      const covered = opacityOf(loader) > 0.95;
      stood ||= covered;
      const shown = seen(document.querySelector("header")) || seen(document.querySelector("main"));
      if (shown && !stood) bad.push(Math.round(performance.now()));
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
  await page.goto(path);
  await page.waitForTimeout(HELD_MS + 1500);
  return page.evaluate(() => Reflect.get(globalThis, "__bad") as number[]);
}

for (const path of ["/s/demo", "/universe", "/s/gnoland"])
  test(`${path}: no frame shows the interface before the loader stands over it`, async ({ page }) => {
    expect(await watch(page, `${path}?test-gpu`)).toEqual([]);
  });

// The fallback's loader (LoaderMarks.tsx) stands only till its page draws: a page with no scene comes in under its fade, and leaves none behind.
for (const path of ["/nowhere", "/r/gno.land/r/gov/dao"])
  test(`${path}: the fallback's loader gives way once the page has drawn`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status", { name: "Loading space" })).toHaveCount(0);
  });
