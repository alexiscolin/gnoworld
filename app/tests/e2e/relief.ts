import type { Page } from "./fixtures.ts";
import type { Circle } from "./lab.ts";
import { reading, type Tools } from "./pixels.ts";

// A ground's relief on a still: where the light grazes, the steps at the borders of 2x2 blocks over those inside them (F4238: a slope
// read once a block of four pixels steps at their borders).

// Where the light grazes (luma 5 to 80): the mean step across the borders of 2-pixel blocks over the mean step inside them; an even
// picture reads 1.
const stepsOf = (discs: readonly Circle[]) => {
  const { image, luma, inside } = Reflect.get(globalThis, "__pixels") as Tools;
  return discs.map((disc) => {
    let [border, borders, inner, inners] = [0, 0, 0, 0];
    for (const [x, y] of inside(disc, 0.9)) {
      const light = luma(image, x, y);
      if (light < 5 || light > 80) continue;
      const [right, below] = [Math.abs(luma(image, x + 1, y) - light), Math.abs(luma(image, x, y + 1) - light)];
      if (x % 2 === 1) [border, borders] = [border + right, borders + 1];
      else [inner, inners] = [inner + right, inners + 1];
      if (y % 2 === 1) [border, borders] = [border + below, borders + 1];
      else [inner, inners] = [inner + below, inners + 1];
    }
    return border / Math.max(borders, 1) / Math.max(inner / Math.max(inners, 1), 1e-6);
  });
};

export const steps = (page: Page, picture: Buffer, discs: readonly Circle[]): Promise<number[]> =>
  reading(page, [picture], [stepsOf, discs]);
