import { MOOD_SCALE, MOOD_STEP, moodAt, newMood } from "../../../packages/core/src/space/mood.ts";
import { MOTES, SHELLS } from "../../../packages/core/src/space/stars.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { loseContext, restoreContext, running, stats } from "./sceneStage.ts";

// The scenery on the software GPU the gate has, under the page's real CSP (the fixtures fail a journey on any violation). The canvas is
// compared with itself, never with an approved picture: a GPU's output varies, a place's does not on one machine. Reduced motion holds
// the eye where a journey puts it, and owes one frame a move.
const HOME = "/?test-gpu";
const COMPUTER = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const FAR = 2 ** 40;

type Spot = Awaited<ReturnType<typeof stats>>["eye"];

// The page's text sits over the canvas: a journey reads what the scene drew.
const hideThePage = (page: Page) =>
  page.evaluate(() => {
    for (const child of document.body.children)
      if (child instanceof HTMLElement && child.querySelector("canvas") === null) child.style.visibility = "hidden";
  });

async function stillScene(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(HOME);
  await running(page);
  await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(0);
  await hideThePage(page);
}

// A place drawn: the frame the move owes has passed when the count has.
async function goTo(page: Page, spot: Spot) {
  const frames = (await stats(page)).frames;
  await page.evaluate((to) => {
    (Reflect.get(globalThis, "__gnoworldScene") as { moveTo: (at: Spot) => void }).moveTo(to);
  }, spot);
  await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(frames);
}

const picture = (page: Page) => page.locator("canvas").screenshot();

// A picture's shape as numbers, read by a page of its own (the site's policy refuses a picture's pixels to one that holds none of its
// own): the median's level, the share past near-white, the small bright dots that are stars, and how far it stands from a second
// picture, as the mean difference per channel out of 255.
async function measured(page: Page, shot: Buffer, other?: Buffer) {
  const reader = await page.context().newPage();
  try {
    await reader.goto("about:blank");
    return await reader.evaluate(
      async ([first, second]) => {
        const read = async (data: string) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (context === null) throw new Error("no canvas");
          context.drawImage(bitmap, 0, 0);
          return context.getImageData(0, 0, bitmap.width, bitmap.height);
        };
        const { data, width, height } = await read(first ?? "");
        const level = (at: number) => ((data[at] ?? 0) + (data[at + 1] ?? 0) + (data[at + 2] ?? 0)) / 3;
        const isDot = (at: number, across: number) => {
          const around = [at - 8, at + 8, at - across * 2, at + across * 2].map(level);
          return level(at) > Math.max(...around) + 24;
        };
        const levels = Array.from({ length: width * height }, (_, pixel) => level(pixel * 4)).sort((a, b) => a - b);
        const inside = Array.from({ length: width * height }, (_, pixel) => pixel * 4).filter((at) => {
          const [x, y] = [(at / 4) % width, Math.floor(at / 4 / width)];
          return x >= 2 && y >= 2 && x < width - 2 && y < height - 2;
        });
        const third = second === undefined ? data : (await read(second)).data;
        const apart = data.reduce((sum, value, at) => sum + Math.abs(value - (third[at] ?? 0)), 0);
        return {
          median: levels[Math.floor(levels.length / 2)] ?? NaN,
          spread:
            (levels.at(-1 - Math.floor(levels.length / 20)) ?? NaN) - (levels[Math.floor(levels.length / 20)] ?? NaN),
          blownShare: levels.filter((value) => value > 245).length / levels.length,
          dots: inside.filter((at) => isDot(at, width * 4)).length,
          apart: apart / data.length,
        };
      },
      [shot.toString("base64"), other?.toString("base64")],
    );
  } finally {
    await reader.close();
  }
}

test.describe("the scenery on a computer", () => {
  test.use({ viewport: COMPUTER });

  test("is near-black, with stars as crisp points and no blinding glow", async ({ page }) => {
    await stillScene(page);
    const look = await measured(page, await picture(page));
    expect(look.median, "near-black").toBeLessThan(48);
    expect(look.blownShare, "no blinding glow").toBeLessThan(0.002);
    expect(look.dots, "crisp points").toBeGreaterThan(40);
  });

  // Where the mood is thickest: haze and stars both at their most, the worst a place can do to "near-black".
  test("stays near-black with no blinding glow in the thickest places too", async ({ page }) => {
    const mood = newMood();
    const thickest = Array.from({ length: 4096 }, (_, at) => {
      const spot = { x: at * MOOD_SCALE * 0.53, y: at * MOOD_SCALE * 0.31, z: at * MOOD_SCALE * -0.71 };
      moodAt(mood, spot);
      return { spot, thick: mood.haze + mood.density };
    })
      .sort((a, b) => b.thick - a.thick)
      .slice(0, 3);
    await stillScene(page);
    for (const { spot } of thickest) {
      await goTo(page, spot);
      const look = await measured(page, await picture(page));
      expect(look.median, "near-black").toBeLessThan(96);
      expect(look.blownShare, "no blinding glow").toBeLessThan(0.002);
    }
  });

  test("is not one flat colour: the mood draws something", async ({ page }) => {
    await stillScene(page);
    expect((await measured(page, await picture(page))).spread).toBeGreaterThan(8);
  });

  test("gives a place the same picture, after going away and coming back", async ({ page }) => {
    await stillScene(page);
    const place = { x: 4000, y: -700, z: 2500 };
    await goTo(page, place);
    const first = await picture(page);
    await goTo(page, { x: 90_000, y: 3000, z: -40_000 });
    expect((await measured(page, first, await picture(page))).apart, "elsewhere is another picture").toBeGreaterThan(
      0.5,
    );
    await goTo(page, place);
    expect((await measured(page, first, await picture(page))).apart).toBeLessThan(0.05);
  });

  test("holds steady at a far coordinate: a small step is a small change, as it is at home", async ({ page }) => {
    await stillScene(page);
    await goTo(page, { x: FAR, y: FAR, z: -FAR });
    const first = await picture(page);
    await goTo(page, { x: FAR + 0.1, y: FAR, z: -FAR });
    const look = await measured(page, first, await picture(page));
    expect(look.apart).toBeLessThan(0.6);
    expect(look.dots, "the sky is still there, this far").toBeGreaterThan(40);
    expect(look.median).toBeLessThan(64);
  });

  test("has no edge: a small step over a cell's border changes the picture a little", async ({ page }) => {
    await stillScene(page);
    // A torus's centre changes half a cell from the last: over each shell's border, the mood's and the motes'.
    for (const size of [...SHELLS.map((shell) => shell.size), MOTES.size, MOOD_STEP]) {
      await goTo(page, { x: size * 3.5 - 0.1, y: 0, z: 0 });
      const first = await picture(page);
      await goTo(page, { x: size * 3.5 + 0.1, y: 0, z: 0 });
      expect((await measured(page, first, await picture(page))).apart, `a cell of ${String(size)}`).toBeLessThan(1);
    }
  });

  test("costs the same draws at home and far away", async ({ page }) => {
    await stillScene(page);
    const home = await stats(page);
    await goTo(page, { x: FAR, y: -FAR, z: FAR });
    const far = await stats(page);
    expect(far.calls).toBe(home.calls);
    expect(far.points).toBe(home.points);
    expect(home.calls).toBeLessThanOrEqual(6);
  });

  test("moves when motion is allowed: the picture changes with the eye", async ({ page }) => {
    await page.goto(HOME);
    await running(page);
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(2);
    await hideThePage(page);
    const start = (await stats(page)).eye;
    const first = await picture(page);
    await expect.poll(async () => (await stats(page)).eye).not.toEqual(start);
    await expect.poll(async () => (await measured(page, first, await picture(page))).apart).toBeGreaterThan(0.02);
  });

  test("still draws its sky on a device known slow", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("gnoworld:scene:tier", "low");
    });
    await stillScene(page);
    const look = await measured(page, await picture(page));
    expect(look.spread).toBeGreaterThan(8);
    expect(look.dots).toBeGreaterThan(40);
  });

  test("comes back whole with a lost context: the sky, its volumes and its stars", async ({ page }) => {
    await stillScene(page);
    const before = await measured(page, await picture(page));
    await loseContext(page);
    await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
    const frames = (await stats(page)).frames;
    await restoreContext(page);
    await running(page);
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(frames);
    const look = await measured(page, await picture(page));
    expect(look.spread).toBeGreaterThan(before.spread / 2);
    expect(look.dots).toBeGreaterThan(before.dots / 2);
  });
});

test.describe("the scenery on a phone", () => {
  test.use({ viewport: PHONE });

  test("fills the screen, near-black, once asked", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(HOME);
    await page.getByRole("button", { name: "View in space" }).click();
    await running(page);
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(0);
    await hideThePage(page);
    const look = await measured(page, await picture(page));
    expect(look.median).toBeLessThan(48);
    expect(look.dots).toBeGreaterThan(10);
  });
});
