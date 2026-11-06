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

/** A computed style of the first element a selector finds. */
export const style = (page: Page, selector: string, property: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), property);
