import { MOOD_STEP, moodAt, newMood } from "../../../packages/core/src/space/mood.ts";
import { MOTES, SHELLS } from "../../../packages/core/src/space/stars.ts";
import { expect, test, type Page } from "./fixtures.ts";
import { hideThePage, landed, loseContext, opened, restoreContext, running, stats } from "./sceneStage.ts";

// The scenery on the software GPU the gate has, under the page's real CSP (the fixtures fail a journey on any violation). The canvas is
// compared with itself, never with an approved picture: a GPU's output varies, a place's does not on one machine. Reduced motion holds
// the eye where a journey puts it, and owes one frame a move.
const HOME = "/?test-gpu";
const BARE = "/net/gnoland/?test-gpu";
const COMPUTER = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const FAR = 2 ** 40;

type Spot = Awaited<ReturnType<typeof stats>>["eye"];

async function stillScene(page: Page, path = HOME) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  await running(page);
  // The home opens with its dive (7d7): the arrival's sky is the one seen once it has landed.
  if (path === HOME) await landed(page);
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
          bright: levels[Math.floor(levels.length * 0.99)] ?? NaN,
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

  // Scored along the view's rays, where the sky reads: the worst a place can do to "near-black".
  test("stays near-black with no blinding glow in the thickest places too", async ({ page }) => {
    const mood = newMood();
    const hazeAhead = (spot: Spot) =>
      [120, 260, 520, 1000].reduce((sum, reach) => {
        moodAt(mood, { x: spot.x, y: spot.y, z: spot.z - reach });
        return sum + mood.haze;
      }, 0);
    const thickest = Array.from({ length: 4096 }, (_, at) => {
      const spot = { x: at * 180.2, y: at * 105.4, z: at * -241.4 };
      return { spot, thick: hazeAhead(spot) };
    })
      .sort((a, b) => b.thick - a.thick)
      .slice(0, 3);
    await stillScene(page);
    for (const { spot } of thickest) {
      await goTo(page, spot);
      const look = await measured(page, await picture(page));
      expect(look.median, "near-black").toBeLessThan(48);
      expect(look.blownShare, "no blinding glow").toBeLessThan(0.002);
    }
  });

  test("has cores in its clouds, brighter than their body: not a flat fog", async ({ page }) => {
    await stillScene(page);
    const look = await measured(page, await picture(page));
    expect(look.bright).toBeGreaterThan(look.median * 3);
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

  test("has no edge: a step over a cell's border changes the picture no more than the same step beside it", async ({
    page,
  }) => {
    await stillScene(page);
    const stepApart = async (x: number) => {
      await goTo(page, { x: x - 0.1, y: 0, z: 0 });
      const first = await picture(page);
      await goTo(page, { x: x + 0.1, y: 0, z: 0 });
      return (await measured(page, first, await picture(page))).apart;
    };
    // A torus's centre changes half a cell from the last: over each shell's border, the mood's and the motes'.
    for (const size of [...SHELLS.map((shell) => shell.size), MOTES.size, MOOD_STEP]) {
      const over = await stepApart(size * 3.5);
      const beside = await stepApart(size * 3.2);
      expect(over, `a cell of ${String(size)}`).toBeLessThan(beside * 1.6 + 0.02);
    }
  });

  // On a universe's home with no worlds: the default one's draws its cosmos too, which stays where it is (7d2).
  test("costs the same draws at home and far away", async ({ page }) => {
    await stillScene(page, BARE);
    await goTo(page, { x: 4000, y: -700, z: 2500 });
    const home = await stats(page);
    await goTo(page, { x: FAR, y: -FAR, z: FAR });
    const far = await stats(page);
    expect(home.points).toBeGreaterThan(0);
    expect(far.calls).toBe(home.calls);
    expect(far.points).toBe(home.points);
    expect(home.calls).toBeLessThanOrEqual(6);
  });

  // A moving scene on the software GPU makes each screenshot cost 4 s alone and 12 to 20 s at 8 workers, and a decode beside it 2 s:
  // three times the time, and one reading once reduced motion has stilled the scene, the page kept for the CSP's flush (F4882, Alexis:
  // "Une lecture, temps x3").
  test("moves when motion is allowed: the picture changes with the eye", async ({ page }) => {
    test.slow();
    await page.goto(HOME);
    await opened(page);
    await landed(page);
    await hideThePage(page);
    const start = (await stats(page)).eye;
    const first = await picture(page);
    await expect.poll(async () => (await stats(page)).eye).not.toEqual(start);
    const second = await picture(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await measured(page, first, second)).apart).toBeGreaterThan(0.02);
  });

  test("still draws its sky on a device known slow", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("gnoworld:scene:tier", "low");
    });
    await stillScene(page);
    expect((await stats(page)).tier).toBe("low");
    const look = await measured(page, await picture(page));
    expect(look.spread).toBeGreaterThan(4);
    expect(look.dots).toBeGreaterThan(40);
  });

  test("comes back whole with a lost context: the sky, its volumes and its stars", async ({ page }) => {
    await stillScene(page);
    // The Earth's maps come after the first frames: "before" is taken with it on stage and a frame drawn since, one the journey owes, for
    // the home's dive has landed with it there (7d7).
    await expect.poll(async () => (await stats(page)).cosmos?.earth).toBe(true);
    await goTo(page, (await stats(page)).eye);
    const before = await picture(page);
    await loseContext(page);
    await expect(page.locator("canvas[data-scene='on']")).toHaveCount(0);
    const frames = (await stats(page)).frames;
    await restoreContext(page);
    await running(page);
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(frames);
    await expect.poll(async () => (await measured(page, before, await picture(page))).apart).toBeLessThan(0.05);
  });

  test("leaves the hero on near-black at the frames' size", async ({ page }) => {
    await page.setViewportSize({ width: 1728, height: 1080 });
    await stillScene(page);
    const shot = await page.screenshot({ clip: { x: 0, y: 660, width: 540, height: 340 } });
    expect((await measured(page, shot)).median).toBeLessThan(14);
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
