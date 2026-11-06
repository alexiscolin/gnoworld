import { readdirSync, readFileSync } from "node:fs";
import { ARRIVAL_LEAN, LEAN } from "@gnoworld/core";
import { TUNABLES } from "../../src/scene/tuning.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { brightness } from "./geometry.ts";
import { askLab, circles, heldQuiet, lit, open, PAGE, picture, SOFTWARE, stats } from "./lab.ts";
import { earthStanding, landed, running, stats as sceneStats } from "./sceneStage.ts";
import { BUILD } from "./sites.ts";

// The workshop's tuning panel (docs/DEVELOPMENT.md, "The workshop"): T shows it on either lab page, its controls change what the real
// renderer draws at once, "Copy" lists what changed and "Reset" puts back the code's values. Under reduced motion the page draws once a change,
// so a picture after a control shows the control's frame.

const TOKENS = "packages/ui/src/tokens.css";
// The palette's primitives, read from the design system's own file: the panel offers each, at the file's value.
const PRIMITIVES = [
  ...readFileSync(new URL(`../../../${TOKENS}`, import.meta.url), "utf8").matchAll(
    /^\s*(--p-[a-z]+):\s*(#[0-9a-f]{6});/gm,
  ),
].map(([, name = "", value = ""]) => ({ name, value }));
// What a site's build would hold of the workshop: its values' names, and its registry's own state, whose names minification keeps.
const TRACES = [...TUNABLES, "workshopValues"];
const CLIENT = new URL("client/", BUILD);

const panel = (page: Page) => page.getByRole("complementary", { name: "Tuning" });
const control = (page: Page, name: string) => panel(page).getByLabel(name, { exact: true });
const list = (page: Page) => panel(page).getByRole("status", { name: "Changed values" });
const copied = async (page: Page) => {
  await panel(page).getByRole("button", { name: "Copy" }).click();
  return list(page).textContent();
};

// The lab's cosmos, the site's own scene, at the video's size and still: a frame a change.
async function onTheCosmos(page: Page, more: string) {
  await page.setViewportSize({ width: 1728, height: 1080 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${PAGE}?view=cosmos${more}`);
  await running(page);
  await landed(page);
}

async function shown(page: Page) {
  await page.keyboard.press("t");
  await expect(panel(page)).toBeVisible();
}

// T again, from inside the panel where the focus stays after a control.
async function hidden(page: Page) {
  await page.keyboard.press("t");
  await expect(panel(page)).toBeHidden();
}

// Measured on the gate's software GPU, 2026-11-04: the close world's disc 1.60 times brighter at exposure 1.6 than at 0.8, the cosmos 1.89
// times at 2; ACES rolls bright light off, so the bounds hold the change, not the curve.
const DISC_BRIGHTER = 1.4;
const COSMOS_BRIGHTER = 1.5;

// What the page fixes over the canvas and does not stack under the panel: the scene's labels' layer comes later in the page, and an equal
// order would put it on top.
const overThePanel = (page: Page) =>
  page.evaluate(() => {
    const aside = document.querySelector("aside");
    const workshop = aside?.parentElement;
    if (aside === null || workshop === null || workshop === undefined) return ["no panel"];
    const order = (element: Element) => Number.parseInt(getComputedStyle(element).zIndex, 10) || 0;
    return Array.from(document.body.querySelectorAll("*"))
      .filter((element) => !workshop.contains(element) && getComputedStyle(element).position === "fixed")
      .filter((element) => order(element) >= order(aside))
      .map((element) => `${element.tagName} ${element.className}`);
  });

const rootStyle = (page: Page) => page.evaluate(() => document.documentElement.style.cssText);
const rootToken = (page: Page, name: string) =>
  page.evaluate((property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(), name);

test.describe("the workshop's tuning panel", () => {
  heldQuiet();

  test("leaves nothing of the workshop in the site's build, and the lab's build holds all of it", () => {
    const files = readdirSync(CLIENT, { recursive: true }).filter((name) => /\.(?:js|html|data)$/.test(name));
    const holds = (name: string, trace: string) => readFileSync(new URL(name, CLIENT), "utf8").includes(trace);
    const site = files.filter((name) => !name.startsWith("lab/"));
    const lab = files.filter((name) => name.startsWith("lab/"));
    expect(site.length, "the site's build").toBeGreaterThan(0);
    expect(site.filter((name) => TRACES.some((trace) => holds(name, trace)))).toEqual([]);
    for (const trace of TRACES)
      expect(
        lab.some((name) => holds(name, trace)),
        trace,
      ).toBe(true);
  });

  test("stays hidden until T, then its exposure brightens the world drawn, with no rebuild", async ({ page }) => {
    await open(page, "?view=close&world=1");
    await expect(panel(page)).toBeHidden();
    const [disc] = await circles(page);
    if (disc === undefined) throw new Error("no world drawn");
    const whole: [number, number, number, number] = [
      Math.round(disc.x - disc.r),
      Math.round(disc.y - disc.r),
      Math.round(disc.x + disc.r),
      Math.round(disc.y + disc.r),
    ];
    const [before = 0] = await lit(page, [whole]);
    const { frames } = await stats(page);
    await shown(page);
    await control(page, "Exposure").fill("1.6");
    await hidden(page);
    await expect.poll(async () => (await stats(page)).frames, SOFTWARE).toBeGreaterThan(frames);
    const [after = 0] = await lit(page, [whole]);
    expect(after, `the disc's light, ${String(before)} before`).toBeGreaterThan(before * DISC_BRIGHTER);
  });

  // The page's own keys change the world, its seed, its stage and its view: on a focused control they move the control alone.
  test("keeps the page's keys inside it: arrows, a seed, a stage and a view move the slider alone", async ({
    page,
  }) => {
    await open(page, "?view=close&world=1&maps=flat");
    const ids = await askLab<string[]>(page, "ids");
    await shown(page);
    await control(page, "Exposure").focus();
    await page.keyboard.press("ArrowRight");
    await expect(control(page, "Exposure")).toHaveValue("0.81");
    for (const key of ["ArrowLeft", "s", "[", "]", "1", "8", "p", "c"]) await page.keyboard.press(key);
    await expect(control(page, "Exposure")).toHaveValue("0.8");
    expect(await askLab<string[]>(page, "ids")).toEqual(ids);
    expect((await stats(page)).view).toBe("close");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByTestId("world")).not.toContainText("ms a frame");
  });

  test("copies exactly the values changed, none back at its default, and Reset puts back the code's and draws", async ({
    page,
  }) => {
    await open(page, "?view=close&world=1&maps=flat");
    await shown(page);
    expect(PRIMITIVES.length).toBe(10);
    for (const { name, value } of PRIMITIVES) await expect(control(page, name), name).toHaveValue(value);
    await expect(control(page, "Exposure")).toHaveValue("0.8");
    for (const [name, px] of [
      ["--font-ui", "13"],
      ["--font-data", "12"],
      ["--space-2xs", "8"],
      ["--space-xs", "12"],
    ] as const)
      await expect(control(page, name), name).toHaveValue(px);

    await control(page, "Exposure").fill("1.25");
    await control(page, "--p-amber").fill("#ff8800");
    await control(page, "--p-mint").fill("#00ff00");
    await control(page, "--p-mint").fill("#5cf2c8");
    await control(page, "--font-ui").fill("15");
    await control(page, "--font-data").fill("14");
    await control(page, "--space-xs").fill("14");
    expect((await stats(page)).exposure).toBe(1.25);
    expect(await rootToken(page, "--color-warm")).toBe("#ff8800");
    expect(await rootToken(page, "--font-ui")).toMatch(/^500 0\.9375rem\/1 /);
    expect(await rootToken(page, "--font-data")).toMatch(/^400 0\.875rem\/1\.4 /);
    expect(await rootToken(page, "--space-xs")).toBe("14px");
    expect(await copied(page)).toBe(
      [
        "grade.exposure: 1.25 (was 0.8) · app/src/scene/renderer.ts, EXPOSURE",
        `--p-amber: #ff8800 (was #ffc46b) · ${TOKENS}`,
        `--font-ui size: 0.9375rem (was 0.8125rem) · ${TOKENS}`,
        `--font-data size: 0.875rem (was 0.75rem) · ${TOKENS}`,
        `--space-xs: 14px (was 12px) · ${TOKENS}`,
      ].join("\n"),
    );
    await control(page, "Exposure").fill("0.8");
    expect(await copied(page)).not.toContain("grade.exposure");

    await control(page, "Exposure").fill("1.25");
    const { frames } = await stats(page);
    await panel(page).getByRole("button", { name: "Reset" }).click();
    await expect.poll(async () => (await stats(page)).frames, SOFTWARE).toBeGreaterThan(frames);
    await expect(control(page, "Exposure")).toHaveValue("0.8");
    await expect(control(page, "--p-amber")).toHaveValue("#ffc46b");
    await expect(control(page, "--font-ui")).toHaveValue("13");
    await expect(control(page, "--space-xs")).toHaveValue("12");
    expect((await stats(page)).exposure).toBe(0.8);
    expect(await rootStyle(page)).toBe("");
    expect(await rootToken(page, "--color-warm")).toBe("#ffc46b");
    expect(await copied(page)).toBe("Nothing changed.");
  });

  test("puts the list on the clipboard where the browser allows it", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, "?view=close&world=1&maps=flat");
    await shown(page);
    await control(page, "--p-coral").fill("#ff0000");
    const text = await copied(page);
    expect(text).toBe(`--p-coral: #ff0000 (was #ff8a7a) · ${TOKENS}`);
    await expect(panel(page).getByText("Copied.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  });

  test("stands on the cosmos too: its exposure reaches the site's own scene, and a drag or a wheel on it moves no view", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await onTheCosmos(page, "");
    await earthStanding(page);
    const whole: [number, number, number, number] = [0, 0, 1728, 1080];
    const [before = 0] = await brightness(page, await picture(page), [whole]);
    const { eye } = await sceneStats(page);
    await shown(page);
    await expect(page.locator("[data-labels] > *").first()).toBeAttached({ timeout: 60_000 });
    expect(await overThePanel(page), "fixed over the canvas, not under the panel").toEqual([]);
    const slider = control(page, "Exposure");
    const place = await slider.boundingBox();
    if (place === null) throw new Error("no slider");
    const y = place.y + place.height / 2;
    await page.mouse.move(place.x + place.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(place.x + place.width * 0.6, y, { steps: 5 });
    await page.mouse.up();
    await page.mouse.wheel(0, 400);
    await slider.fill("2");
    const { frames } = await sceneStats(page);
    await hidden(page);
    await expect.poll(async () => (await sceneStats(page)).frames, { timeout: 60_000 }).toBeGreaterThan(frames);
    expect((await sceneStats(page)).eye).toEqual(eye);
    const [after = 0] = await brightness(page, await picture(page), [whole]);
    expect(after, `the cosmos's light, ${String(before)} before`).toBeGreaterThan(before * COSMOS_BRIGHTER);
  });
  // A system's view reads its share of the lean once the arrival's chunk came: T shows what the code has read by then, so it is asked again.
  test("offers the home's lean and a system's share at a system's view, at the code's values, and copies a moved one", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await onTheCosmos(page, "&arrive=gnoswap");
    await expect
      .poll(
        async () => {
          if (await panel(page).isHidden()) await page.keyboard.press("t");
          const found = await control(page, "Lean share at a system").count();
          if (found === 0) await page.keyboard.press("t");
          return found;
        },
        { timeout: 90_000 },
      )
      .toBe(1);
    await expect(control(page, "Lean at home")).toHaveValue(String(LEAN));
    await control(page, "Lean share at a system").fill("0.6");
    expect(await copied(page)).toBe(
      `eye.arrivalShare: 0.6 (was ${String(ARRIVAL_LEAN / LEAN)}) · packages/core/src/space/drift.ts, ARRIVAL_LEAN = LEAN × the share`,
    );
  });
  // A computer has T, and the lab's pictures of the canvas stay whole (realism.spec's Earth at 0 px): no button stands over them.
  test("shows no button on a computer", async ({ page }) => {
    await open(page, "?view=close&world=1&maps=flat");
    await expect(page.getByRole("button", { name: "Tuning" })).toBeHidden();
  });
});

// A phone has no keyboard (F4730): on a touch screen its button shows the panel and hides it, as T does, on both pages.
test.describe("the workshop's tuning panel on a phone", () => {
  heldQuiet();
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("opens and closes from its button, on both pages", async ({ page }) => {
    for (const query of ["?view=close&world=1&maps=flat", "?view=cosmos"]) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${PAGE}${query}`);
      const button = page.getByRole("button", { name: "Tuning" });
      await expect(button).toHaveAttribute("aria-expanded", "false");
      await button.tap();
      await expect(panel(page)).toBeVisible();
      await expect(button).toHaveAttribute("aria-expanded", "true");
      await expect(control(page, "--p-amber")).toBeVisible();
      await button.tap();
      await expect(panel(page)).toBeHidden();
    }
  });
});
