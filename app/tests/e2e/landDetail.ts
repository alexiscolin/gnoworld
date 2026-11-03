import type { Page } from "./fixtures.ts";
import type { Circle } from "./lab.ts";
import { READ, type gridOf } from "./coasts.ts";
import { reading, type Tools } from "./pixels.ts";
import { dayBox } from "./portraits.ts";

// A world's land off its coasts and its clouds (7b8), on coasts.ts's grid: its fine detail as the day box reads it (portraits.ts), the
// Laplacian's energy at full size and its share over the energy at half size, on land alone, so no coast's step and no sea's flat counts.
export interface LandDetail {
  /** The 2-pixel blocks read: lit land (luma over 25) with land 4 pixels round each way. */
  readonly blocks: number;
  /** The mean squared Laplacian of the lightness at full size. */
  readonly energy: number;
  /** That energy over the half size's: a blur lowers it, grain raises it. */
  readonly sharpness: number;
}
// The helpers the reading page declares, as it holds them: an imported function is a property of the import's binding once compiled.
interface Held {
  readonly gridOf: typeof gridOf;
  readonly dayBox: typeof dayBox;
}
const held = (): Held => globalThis as unknown as Held;

// Each disc's land read whole, or only inside its day box where `boxed` (the Earth's view: its land there is southern India).
function landDetailsOf(input: readonly (readonly [Circle, boolean])[]): LandDetail[] {
  const { image, luma } = Reflect.get(globalThis, "__pixels") as Tools;
  return input.map(([disc, boxed]) => {
    const { kinds, w, x0, y0 } = held().gridOf(disc);
    const [left, right, top, bottom] = boxed ? held().dayBox(disc) : [-Infinity, Infinity, -Infinity, Infinity];
    const land = (x: number, y: number) => kinds[(y - y0) * w + (x - x0)] === 2;
    const at = (x: number, y: number) => luma(image, x, y);
    const half = (i: number, j: number) =>
      (at(2 * i, 2 * j) + at(2 * i + 1, 2 * j) + at(2 * i, 2 * j + 1) + at(2 * i + 1, 2 * j + 1)) / 4;
    const lap = (value: (i: number, j: number) => number, i: number, j: number) =>
      4 * value(i, j) - value(i - 1, j) - value(i + 1, j) - value(i, j - 1) - value(i, j + 1);
    let [blocks, full, coarse] = [0, 0, 0];
    for (let j = Math.ceil(y0 / 2) + 2; 2 * j + 6 < y0 + w; j++)
      for (let i = Math.ceil(x0 / 2) + 2; 2 * i + 6 < x0 + w; i++) {
        const [x, y] = [2 * i, 2 * j];
        if (x < left || x >= right || y < top || y >= bottom || at(x, y) <= 25) continue;
        if ([-4, 0, 1, 5].some((dy) => [-4, 0, 1, 5].some((dx) => !land(x + dx, y + dy)))) continue;
        blocks += 1;
        full += (lap(at, x, y) ** 2 + lap(at, x + 1, y) ** 2 + lap(at, x, y + 1) ** 2 + lap(at, x + 1, y + 1) ** 2) / 4;
        coarse += lap(half, i, j) ** 2;
      }
    return { blocks, energy: full / Math.max(blocks, 1), sharpness: full / Math.max(coarse, 1e-9) };
  });
}

const LAND = [READ, `const held = ${String(held)};`, dayBox].map(String).join("\n");

export const landDetailsOn = (
  page: Page,
  picture: Buffer,
  discs: readonly (readonly [Circle, boolean])[],
): Promise<LandDetail[]> => reading(page, [picture], [landDetailsOf, discs, LAND]);
