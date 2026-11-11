import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hydrated, test } from "./fixtures.ts";

// The Earth's page opened from its URL (2026-11-11): when its header shows, when the scene says its planet is itself, each in ms since the
// page began, and the first frames' gaps; one JSON line to `EARTH_READY_OUT`. `EARTH_FIXED_TIME=1` freezes the clock as onEarth does: GSAP
// reads Date.now, so the header's fade never moves and it stays hidden (the cause of the hang the journeys saw).
declare const process: { env: Record<string, string | undefined> };
const OUT = process.env["EARTH_READY_OUT"] ?? join(tmpdir(), "earthReady.jsonl");
const HOUR = new Date("2026-11-02T21:30:00.000Z");
test.use({ viewport: { width: 960, height: 560 } });
test.describe.configure({ timeout: 240_000 });

test("the Earth's page shows its header at once, whatever the GPU compiles", async ({ page }) => {
  await page.addInitScript(() => {
    const at: Record<string, number> = {};
    const gaps: number[] = [];
    let last = performance.now();
    const frame = (t: number) => {
      gaps.push(Math.round(t - last));
      last = t;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    setInterval(() => {
      const now = Math.round(performance.now());
      const header = document.querySelector("header");
      const style = header === null ? undefined : getComputedStyle(header);
      if (style !== undefined && Number(style.opacity) > 0.99 && style.visibility !== "hidden") at["header"] ??= now;
      if (document.querySelector("canvas[data-sharp]") !== null) at["sharp"] ??= now;
    }, 20);
    Reflect.set(globalThis, "__ready", () =>
      JSON.stringify({ ...at, frames: gaps.length, firstGaps: gaps.slice(0, 30) }),
    );
  });
  if (process.env["EARTH_FIXED_TIME"] === "1") await page.clock.setFixedTime(HOUR);
  else await page.clock.setSystemTime(HOUR);
  await page.goto("/earth?test-gpu");
  await hydrated(page);
  await page.waitForTimeout(12_000);
  const line = await page.evaluate(() =>
    Reflect.apply(Reflect.get(globalThis, "__ready") as () => string, undefined, []),
  );
  appendFileSync(OUT, `${line}\n`);
});
