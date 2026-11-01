import { expect, type Page } from "./fixtures.ts";

// A box measured at the video's size, held to 2 px of a frame's, for anti-aliasing and compression: what the geometry journeys share.
const NEAR = 2;
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const box = async (page: Page, selector: string): Promise<Box> => {
  const found = await page.locator(selector).first().boundingBox();
  expect(found, `${selector} is not on the page`).not.toBeNull();
  return found ?? { x: 0, y: 0, width: 0, height: 0 };
};
export const near = (actual: number, wanted: number, what: string) => {
  expect(Math.abs(actual - wanted), `${what}: ${String(actual)}, the frame's ${String(wanted)}`).toBeLessThanOrEqual(
    NEAR,
  );
};

// The mean brightness of boxes of a picture, read by a page of its own (the site's policy refuses a picture's pixels to a page
// that holds none of its own): each box is [x0, y0, x1, y1].
export async function brightness(
  page: Page,
  picture: Buffer,
  boxes: [number, number, number, number][],
): Promise<number[]> {
  const reader = await page.context().newPage();
  try {
    await reader.goto("about:blank");
    return await reader.evaluate(
      async ([base64, cells]) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("no canvas");
        context.drawImage(bitmap, 0, 0);
        const { data, width } = context.getImageData(0, 0, bitmap.width, bitmap.height);
        return cells.map(([x0, y0, x1, y1]) => {
          let sum = 0;
          for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
              const at = (y * width + x) * 4;
              sum += 0.2126 * (data[at] ?? 0) + 0.7152 * (data[at + 1] ?? 0) + 0.0722 * (data[at + 2] ?? 0);
            }
          return sum / ((x1 - x0) * (y1 - y0));
        });
      },
      [picture.toString("base64"), boxes] as const,
    );
  } finally {
    await reader.close();
  }
}
