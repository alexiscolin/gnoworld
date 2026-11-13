import { test, expect } from "./fixtures.ts";
import { onEarth } from "./earthStage.ts";

// How sharp the Earth is drawn on a computer (2x screen) whose browser calls its link 3g: the buffer is the screen's own, and the Earth's
// full-size (4096) day and night maps come in behind the half-size ones it was built from.
test.describe.configure({ timeout: 180_000 });
test.use({ viewport: { width: 1728, height: 1080 }, deviceScaleFactor: 2 });

const widths = () => {
  const space = Reflect.get(globalThis, "__gnoworldSpace") as {
    renderer: { getPixelRatio: () => number };
    stage: {
      scene: {
        traverseVisible: (visit: (o: { material?: { uniforms?: Record<string, { value: unknown }> } }) => void) => void;
      };
    };
  };
  const found: Record<string, number> = { ratio: space.renderer.getPixelRatio() };
  space.stage.scene.traverseVisible((o) => {
    for (const [name, { value }] of Object.entries(o.material?.uniforms ?? {})) {
      const width = (value as { image?: { width?: number } } | null)?.image?.width;
      if (typeof width === "number") found[name] = width;
    }
  });
  return found;
};

test("draws the Earth at the screen's ratio, its maps full size, on a link the browser calls 3g", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      value: { effectiveType: "3g", saveData: false },
      configurable: true,
    });
  });
  await onEarth(page, { ticking: true, motion: true });
  await expect
    .poll(() => page.evaluate(widths), { timeout: 60_000 })
    .toMatchObject({ ratio: 2, surface: 4096, nightMap: 4096 });
});
