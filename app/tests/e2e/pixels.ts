import type { Page } from "./fixtures.ts";

// A picture's pixels, read by a page of its own: the site's policy refuses a picture's pixels to a page that holds none of its own.
// Every measure the journeys take of a picture runs there, behind one decode, which leaves the pictures and their reading tools on the
// page: a pixel's colour in CIE Lab (core's D65 formulas, which that page cannot import), its lightness, its luma, a block's mean.
type Box = [number, number, number, number];
type Lab = [number, number, number];
interface Image {
  readonly data: Uint8ClampedArray;
  readonly width: number;
}
export interface Tools {
  readonly images: readonly Image[];
  readonly labAt: (image: Image, x: number, y: number) => Lab;
  readonly luma: (image: Image, x: number, y: number) => number;
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
  const luma = ({ data, width }: Image, x: number, y: number) => {
    const at = (y * width + x) * 4;
    return 0.2126 * (data[at] ?? 0) + 0.7152 * (data[at + 1] ?? 0) + 0.0722 * (data[at + 2] ?? 0);
  };
  const block = (image: Image, s: number, [bx, by]: readonly [number, number]) => {
    let sum = 0;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) sum += labAt(image, bx + i, by + j)[0];
    return sum / (s * s);
  };
  Reflect.set(globalThis, "__pixels", { images, labAt, luma, block });
};

/** Decodes `pictures` on a page of their own, then runs `read` there on `input`: `read` reaches the tools as `globalThis.__pixels`. */
export async function reading<Input, Output>(
  page: Page,
  pictures: readonly Buffer[],
  [read, input]: readonly [(given: Input) => Output, Input],
): Promise<Output> {
  const reader = await page.context().newPage();
  try {
    await reader.goto("about:blank");
    await reader.evaluate(
      install,
      pictures.map((picture) => picture.toString("base64")),
    );
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
