import type { Page } from "./fixtures.ts";
import type { Circle } from "./lab.ts";
import { reading, type Tools } from "./pixels.ts";

// What 7b6 reads of a world's surface on a still, each in a page of its own (pixels.ts): the colour of its brightest pixels, the depth
// of its darkest spots, and, between two pictures of one view, how far the lightness moved and whether what moved is whole latitudes.
// Every disc is read inside nine tenths of its radius, or as said.
export interface Core {
  readonly colour: readonly [number, number, number];
  readonly luma: number;
}

// The mean colour and luma of a disc's brightest 2%: a glowing world's hottest cores.
const coresOf = (discs: readonly Circle[]): Core[] => {
  const { image, luma, rgbAt, inside } = Reflect.get(globalThis, "__pixels") as Tools;
  return discs.map((disc) => {
    const points = inside(disc, 0.95).sort(([ax, ay], [bx, by]) => luma(image, bx, by) - luma(image, ax, ay));
    const top = points.slice(0, Math.max(1, Math.round(points.length * 0.02)));
    const sum = top.reduce<[number, number, number, number]>(
      (total, [x, y]) => {
        const [red, green, blue] = rgbAt(image, x, y);
        return [total[0] + red, total[1] + green, total[2] + blue, total[3] + luma(image, x, y)];
      },
      [0, 0, 0, 0],
    );
    return { colour: [sum[0] / top.length, sum[1] / top.length, sum[2] / top.length], luma: sum[3] / top.length };
  });
};

// The well-lit ground (right of 0.15 of the radius, inside 0.85): its 0.5th percentile luma and its median.
const darkestOf = (discs: readonly Circle[]) => {
  const { image, luma, inside } = Reflect.get(globalThis, "__pixels") as Tools;
  return discs.map((disc) => {
    const lights = inside(disc, 0.85)
      .filter(([x]) => x > disc.x + 0.15 * disc.r)
      .map(([x, y]) => luma(image, x, y))
      .sort((a, b) => a - b);
    const at = (share: number) => lights[Math.floor(share * (lights.length - 1))] ?? 0;
    return { darkest: at(0.005), median: at(0.5) };
  });
};

// The tools, with the second of two pictures of one view.
function twoPictures() {
  const tools = Reflect.get(globalThis, "__pixels") as Tools;
  const other = tools.images[1];
  if (other === undefined) throw new Error("two pictures");
  return { ...tools, other };
}

// Two pictures of one view: the mean move of the lightness (L*) where either is lit, and the share of those pixels moved past 20.
const lightnessOf = (discs: readonly Circle[]) => {
  const { image, other, labAt, inside } = twoPictures();
  return discs.map((disc) => {
    let [count, sum, far] = [0, 0, 0];
    for (const [x, y] of inside(disc, 0.9)) {
      const [one, two] = [labAt(image, x, y)[0], labAt(other, x, y)[0]];
      if (one < 8 && two < 8) continue;
      [count, sum, far] = [count + 1, sum + two - one, far + (Math.abs(two - one) > 20 ? 1 : 0)];
    }
    return { move: sum / Math.max(count, 1), far: far / Math.max(count, 1) };
  });
};

// Two pictures of one view: of the lit pixels moved past 6 in colour (CIE Lab), the share in strips 2 px wide where most of the lit pixels moved, the
// strips run the way that holds the most (a world's bands lean with its axis): a giant's minor is whole bands, never pieces (F4245).
// A disc where nothing moved reads 1: a test also asks that some move.
const rowsOf = (discs: readonly Circle[]) => {
  const { image, other, labAt, inside } = twoPictures();
  return discs.map((disc) => {
    const lit = inside(disc, 0.8).flatMap(([x, y]) => {
      const [one, two] = [labAt(image, x, y), labAt(other, x, y)];
      const apart = Math.hypot(two[0] - one[0], two[1] - one[1], two[2] - one[2]);
      return one[0] < 8 && two[0] < 8 ? [] : [[x - disc.x, y - disc.y, apart > 6 ? 1 : 0] as const];
    });
    const moved = lit.reduce((sum, [, , move]) => sum + move, 0);
    if (moved === 0) return 1;
    const along = (angle: number) => {
      const strips = new Map<number, [number, number]>();
      for (const [x, y, move] of lit) {
        const strip = Math.floor((y * Math.cos(angle) - x * Math.sin(angle)) / 2);
        const [count, hit] = strips.get(strip) ?? [0, 0];
        strips.set(strip, [count + 1, hit + move]);
      }
      return [...strips.values()].reduce((sum, [count, hit]) => sum + (hit >= 0.6 * count ? hit : 0), 0) / moved;
    };
    return Math.max(...Array.from({ length: 36 }, (_, step) => along((step * Math.PI) / 36)));
  });
};

export const cores = (page: Page, picture: Buffer, discs: readonly Circle[]): Promise<Core[]> =>
  reading(page, [picture], [coresOf, discs]);
export const darkest = (page: Page, picture: Buffer, discs: readonly Circle[]) =>
  reading(page, [picture], [darkestOf, discs]);
export const lightness = (page: Page, pictures: readonly [Buffer, Buffer], discs: readonly Circle[]) =>
  reading(page, pictures, [lightnessOf, discs, String(twoPictures)]);
export const wholeRows = (
  page: Page,
  pictures: readonly [Buffer, Buffer],
  discs: readonly Circle[],
): Promise<number[]> => reading(page, pictures, [rowsOf, discs, String(twoPictures)]);
