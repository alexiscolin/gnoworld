import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { expect, hydrated, test } from "../e2e/fixtures.ts";
import { running } from "../e2e/sceneStage.ts";
import { pictureFile } from "../../src/lib/pictureFile.ts";
import { inputsHash, MANIFEST, PICTURES, worldIds } from "./pictureInputs.ts";

// Takes the picture of each world of the chat's column once, from the scene as the universe's rail draws it (Scene.portraits: the same
// renderer, camera and light), 88 px for a 44 px planet at 2x, encoded as WebP in the browser; and writes the manifest the unit test checks.
const SIDE = 88;
const QUALITY = 0.85;
const HOME = "/?test-gpu";

test.describe.configure({ timeout: 240_000 });

test("takes the chat's planet pictures", async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 1080 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(HOME);
  await hydrated(page);
  await running(page);
  const ids = worldIds();
  const taken = await page.evaluate(
    async ({ ids, side, quality }) => {
      const scene = Reflect.get(globalThis, "__gnoworldScene") as {
        portraits(ids: string[], size: number, signal: AbortSignal): Promise<Map<string, string>>;
      };
      const drawn = await scene.portraits(ids, side, new AbortController().signal);
      const webp: [string, string][] = [];
      for (const [id, url] of drawn) {
        const picture = new Image();
        picture.src = url;
        await picture.decode();
        const canvas = document.createElement("canvas");
        [canvas.width, canvas.height] = [side, side];
        canvas.getContext("2d")?.drawImage(picture, 0, 0, side, side);
        webp.push([id, canvas.toDataURL("image/webp", quality)]);
      }
      return webp;
    },
    { ids, side: SIDE, quality: QUALITY },
  );
  expect(taken.map(([id]) => id).sort()).toEqual([...ids].sort());
  rmSync(PICTURES, { recursive: true, force: true });
  mkdirSync(PICTURES, { recursive: true });
  const manifest: Record<string, string> = {};
  for (const id of ids) {
    const url = taken.find(([each]) => each === id)?.[1] ?? "";
    expect(url.startsWith("data:image/webp;base64,")).toBe(true);
    const inputs = inputsHash(id);
    const file = pictureFile(id, inputs);
    writeFileSync(
      `${PICTURES}${file}`,
      Uint8Array.from(atob(url.split(",")[1] ?? ""), (char) => char.charCodeAt(0)),
    );
    manifest[id] = inputs;
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
});
