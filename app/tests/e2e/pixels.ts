import type { Page } from "./fixtures.ts";

// A picture's pixels, read by a page of its own: the site's policy refuses a picture's pixels to a page that holds none of its own.
// Every measure the journeys take of a picture runs there, behind one decode, which leaves the pictures and their reading tools on the
// page: a pixel's colour in CIE Lab (core's D65 formulas, which that page cannot import), its lightness, its luma, a block's mean.
type Box = [number, number, number, number];
type Lab = [number, number, number];
type Rgb = readonly [number, number, number];
interface Image {
  readonly data: Uint8ClampedArray;
  readonly width: number;
}
export interface Tools {
  readonly images: readonly Image[];
  /** The first picture. */
  readonly image: Image;
  readonly labAt: (image: Image, x: number, y: number) => Lab;
  readonly luma: (image: Image, x: number, y: number) => number;
  readonly rgbAt: (image: Image, x: number, y: number) => Rgb;
  /** The pixels of a disc inside `reach` of its radius. */
  readonly inside: (disc: { x: number; y: number; r: number }, reach: number) => [number, number][];
  /** The mean lightness of an `s`-pixel block of `image` from (x, y). */
  readonly block: (image: Image, s: number, at: readonly [number, number]) => number;
}

const install = async (base64s: readonly string[]) => {
  const decode = async (base64: string) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("no canvas");
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  };
  const images = await Promise.all(base64s.map(decode));
  const channel = (value: number) =>
    value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4;
  const curve = (t: number) => (t > 0.008856 ? Math.cbrt(t) : t / 0.128418 + 4 / 29);
  const labAt = ({ data, width }: Image, x: number, y: number): Lab => {
    const at = (y * width + x) * 4;
    const [r, g, b] = [channel(data[at] ?? 0), channel(data[at + 1] ?? 0), channel(data[at + 2] ?? 0)];
    const fx = curve((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
    const fy = curve(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
    const fz = curve((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  const rgbAt = ({ data, width }: Image, x: number, y: number): Rgb => {
    const at = (y * width + x) * 4;
    return [data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0];
  };
  const luma = (image: Image, x: number, y: number) => {
    const [red, green, blue] = rgbAt(image, x, y);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const inside = ({ x, y, r }: { x: number; y: number; r: number }, reach: number) => {
    const points: [number, number][] = [];
    for (let py = Math.ceil(y - reach * r); py < y + reach * r; py++)
      for (let px = Math.ceil(x - reach * r); px < x + reach * r; px++)
        if ((px - x) ** 2 + (py - y) ** 2 <= (reach * r) ** 2) points.push([px, py]);
    return points;
  };
  const block = (image: Image, s: number, [bx, by]: readonly [number, number]) => {
    let sum = 0;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) sum += labAt(image, bx + i, by + j)[0];
    return sum / (s * s);
  };
  const [image] = images;
  if (image === undefined) throw new Error("no picture");
  Reflect.set(globalThis, "__pixels", { images, image, labAt, luma, rgbAt, inside, block });
};

/** Decodes `pictures` on a page of their own, then runs `read` there on `input`: `read` reaches the tools as `globalThis.__pixels`, and
 * the functions `helpers` declares as the page's own. */
export async function reading<Input, Output>(
  page: Page,
  pictures: readonly Buffer[],
  [read, input, helpers = ""]: readonly [(given: Input) => Output, Input, string?],
): Promise<Output> {
  const reader = await page.context().newPage();
  try {
    await reader.goto("about:blank");
    await reader.evaluate(
      install,
      pictures.map((picture) => picture.toString("base64")),
    );
    if (helpers !== "") await reader.addScriptTag({ content: helpers });
    return (await reader.evaluate(read as (given: unknown) => unknown, input as unknown)) as Output;
  } finally {
    await reader.close();
  }
}

const boxColours = (boxes: readonly Box[]) => {
  const { images } = Reflect.get(globalThis, "__pixels") as Tools;
  const [image] = images;
  if (image === undefined) throw new Error("no picture");
  return boxes.map(([x0, y0, x1, y1]) => {
    let [red, green, blue] = [0, 0, 0];
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const at = (y * image.width + x) * 4;
        [red, green, blue] = [
          red + (image.data[at] ?? 0),
          green + (image.data[at + 1] ?? 0),
          blue + (image.data[at + 2] ?? 0),
        ];
      }
    const pixels = (x1 - x0) * (y1 - y0);
    return [red / pixels, green / pixels, blue / pixels] as [number, number, number];
  });
};

// FNV-1a over the pixels from two starts: 64 bits, enough to tell any change; about:blank has no crypto.subtle.
const hashOf = () => {
  const { images } = Reflect.get(globalThis, "__pixels") as Tools;
  let [one, two] = [0x811c9dc5, 0x9e3779b9];
  for (const byte of images[0]?.data ?? []) {
    one = Math.imul(one ^ byte, 0x01000193) >>> 0;
    two = Math.imul(two ^ byte, 0x01000193) >>> 0;
  }
  return one.toString(16).padStart(8, "0") + two.toString(16).padStart(8, "0");
};

/** The mean red, green and blue of each box of `picture` ([x0, y0, x1, y1]), from 0 to 255. */
export const colours = (page: Page, picture: Buffer, boxes: Box[]) => reading(page, [picture], [boxColours, boxes]);

/** A 64-bit hash of a picture's decoded pixels: a 0 px pin, whatever the PNG's own encoding. */
export const pixelHash = (page: Page, picture: Buffer) => reading(page, [picture], [hashOf, undefined]);

/** Per disc, inside 95% of its radius: the shares of its pixels white-hot (luma over 170, warm), white (as bright, its blue two
 * thirds of its red or more), deep red, glowing gold or red (any of the last two in the left, night half too), pale and cold; and the
 * mean CIE Lab of its pixels over luma 30. */
export interface Glow {
  readonly hot: number;
  readonly white: number;
  readonly red: number;
  readonly glow: number;
  readonly night: number;
  readonly pale: number;
  readonly lab: readonly [number, number, number];
}
const glowOf = (discs: readonly { x: number; y: number; r: number }[]) => {
  const { image, luma, labAt, rgbAt, inside } = Reflect.get(globalThis, "__pixels") as Tools;
  const KINDS = ["hot", "white", "red", "glow", "pale"] as const;
  const kindsOf = ([red, green, blue]: Rgb, light: number) => {
    const hot = light > 170 && red > blue + 20;
    const warm = !hot && red > 90;
    return {
      hot,
      white: light > 170 && blue >= (2 / 3) * red,
      red: warm && red > green * 1.6,
      glow: warm && red > green && green >= blue && red - blue > 50,
      pale: light > 70 && red <= blue + 20,
    };
  };
  const tally = (points: readonly [number, number][], centre: number) => {
    const counts = { hot: 0, white: 0, red: 0, glow: 0, pale: 0, left: 0, night: 0, seen: 0 };
    const lab = [0, 0, 0];
    for (const [px, py] of points) {
      const light = luma(image, px, py);
      const kinds = kindsOf(rgbAt(image, px, py), light);
      for (const kind of KINDS) counts[kind] += Number(kinds[kind]);
      counts.left += Number(px < centre);
      counts.night += Number(px < centre && kinds.glow);
      if (light <= 30) continue;
      counts.seen += 1;
      for (const [at, value] of labAt(image, px, py).entries()) lab[at] = (lab[at] ?? 0) + value;
    }
    return { counts, lab };
  };
  return discs.map((disc) => {
    const points = inside(disc, 0.95);
    const { counts, lab } = tally(points, disc.x);
    const [all, seen] = [Math.max(points.length, 1), Math.max(counts.seen, 1)];
    return {
      ...{ hot: counts.hot / all, white: counts.white / all, red: counts.red / all, glow: counts.glow / all },
      ...{ night: counts.night / Math.max(counts.left, 1), pale: counts.pale / all },
      lab: [(lab[0] ?? 0) / seen, (lab[1] ?? 0) / seen, (lab[2] ?? 0) / seen] as const,
    };
  });
};

/** What glows on each disc of `picture`, and its colour (a glowing world's vents, their edges, its veins, and what no crust is). */
export const glows = (
  page: Page,
  picture: Buffer,
  discs: readonly { x: number; y: number; r: number }[],
): Promise<Glow[]> => reading(page, [picture], [glowOf, discs]);
