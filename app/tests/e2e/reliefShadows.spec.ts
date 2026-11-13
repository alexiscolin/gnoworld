import { build } from "vite";
import { expect, test } from "./fixtures.ts";

// The relief's shadows do not jump as the sun turns (D13012): the real planet code and maps, fixed world, camera, time and sun steps, on the
// software GPU (`reliefShadowsPage.ts`); the shader's output is the sun's share the shadows leave, and pixels changing over 50/255 are counted.
// Sharp march: Moon 2132, rocky 10755; blurred: 32 and 1600. The limits sit far under the sharp ones, with room for rounding and a seed.
const LIMITS = { moon: 400, rocky: 5000 } as const;
const STEP = 0.01;
const STEPS = 160;
test.describe.configure({ timeout: 240_000 });

async function pageCode(): Promise<string> {
  const built = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: { entry: new URL("./reliefShadowsPage.ts", import.meta.url).pathname, formats: ["iife"], name: "shadows" },
    },
  });
  const outputs = (Array.isArray(built) ? built : [built]).flatMap((one) => ("output" in one ? one.output : []));
  const chunk = outputs.find((each) => each.type === "chunk");
  if (chunk?.type !== "chunk") throw new Error("the page's code did not bundle");
  return chunk.code;
}

for (const what of ["moon", "rocky"] as const)
  test(`the ${what}'s relief shadows do not jump as the sun turns`, async ({ page, baseURL }) => {
    const code = await pageCode();
    await page.route("**/reliefShadows.html", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }),
    );
    await page.goto(`${baseURL ?? ""}/reliefShadows.html`);
    await page.addScriptTag({ content: code });
    const counted = await page.evaluate(
      ([name, step, count]) =>
        (
          Reflect.get(globalThis, "sweep") as (
            what: string,
            step: number,
            count: number,
          ) => Promise<{ big: number; mid: number; shadowed: number }>
        )(name, step, count),
      [what, STEP, STEPS] as const,
    );
    expect(counted.shadowed, "some ground is in the shadow's reach: the sweep sees the relief").toBeGreaterThan(10_000);
    expect(counted.big, `pixels that jumped more than 50/255 in a step of ${String(STEP)} rad`).toBeLessThan(
      LIMITS[what],
    );
  });
