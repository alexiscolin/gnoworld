import { expect, type Page } from "./fixtures.ts";
import { colours, reading, type Tools } from "./pixels.ts";

export { colours };

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

// The share of a picture's pixels whose mean of red, green and blue is `least` or more, read in a page of its own (pixels.ts).
const brightOf = (least: number) => {
  const { image } = Reflect.get(globalThis, "__pixels") as Tools;
  let bright = 0;
  for (let at = 0; at < image.data.length; at += 4)
    if (((image.data[at] ?? 0) + (image.data[at + 1] ?? 0) + (image.data[at + 2] ?? 0)) / 3 >= least) bright += 1;
  return bright / (image.data.length / 4);
};

/** The share of `picture`'s pixels whose mean of red, green and blue is `least` or more. */
export const brightShare = (page: Page, picture: Buffer, least: number): Promise<number> =>
  reading(page, [picture], [brightOf, least]);

/** The mean light of each box of `picture`. */
export const brightness = async (page: Page, picture: Buffer, boxes: [number, number, number, number][]) =>
  (await colours(page, picture, boxes)).map(([red, green, blue]) => 0.2126 * red + 0.7152 * green + 0.0722 * blue);
