import { expect, type Page } from "./fixtures.ts";
import { colours } from "./pixels.ts";

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

/** The mean light of each box of `picture`. */
export const brightness = async (page: Page, picture: Buffer, boxes: [number, number, number, number][]) =>
  (await colours(page, picture, boxes)).map(([red, green, blue]) => 0.2126 * red + 0.7152 * green + 0.0722 * blue);
