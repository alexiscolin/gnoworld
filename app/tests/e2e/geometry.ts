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

// A picture read by a page of its own (the site's policy refuses a picture's pixels to a page that holds none of its own): the mean red,
// green and blue of each box [x0, y0, x1, y1], and the share of its pixels whose mean of the three is `least` or more.
async function read(
  page: Page,
  picture: Buffer,
  { boxes, least }: { boxes: [number, number, number, number][]; least: number },
): Promise<{ means: [number, number, number][]; bright: number }> {
  const reader = await page.context().newPage();
  try {
    await reader.goto("about:blank");
    return await reader.evaluate(
      async ([base64, cells, floor]) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("no canvas");
        context.drawImage(bitmap, 0, 0);
        const { data, width } = context.getImageData(0, 0, bitmap.width, bitmap.height);
        let bright = 0;
        for (let at = 0; at < data.length; at += 4)
          if (((data[at] ?? 0) + (data[at + 1] ?? 0) + (data[at + 2] ?? 0)) / 3 >= floor) bright += 1;
        const means = cells.map(([x0, y0, x1, y1]) => {
          let red = 0;
          let green = 0;
          let blue = 0;
          for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
              const at = (y * width + x) * 4;
              red += data[at] ?? 0;
              green += data[at + 1] ?? 0;
              blue += data[at + 2] ?? 0;
            }
          const pixels = (x1 - x0) * (y1 - y0);
          return [red / pixels, green / pixels, blue / pixels] as [number, number, number];
        });
        return { means, bright: bright / (data.length / 4) };
      },
      [picture.toString("base64"), boxes, least] as const,
    );
  } finally {
    await reader.close();
  }
}

/** The mean red, green and blue of each box of `picture`, from 0 to 255. */
export const colours = async (page: Page, picture: Buffer, boxes: [number, number, number, number][]) =>
  (await read(page, picture, { boxes, least: Infinity })).means;

/** The share of `picture`'s pixels whose mean of red, green and blue is `least` or more. */
export const brightShare = async (page: Page, picture: Buffer, least: number) =>
  (await read(page, picture, { boxes: [], least })).bright;

/** The mean light of each box of `picture`. */
export const brightness = async (page: Page, picture: Buffer, boxes: [number, number, number, number][]) =>
  (await colours(page, picture, boxes)).map(([red, green, blue]) => 0.2126 * red + 0.7152 * green + 0.0722 * blue);
