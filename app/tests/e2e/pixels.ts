import type { Page } from "./fixtures.ts";

// A picture's pixels, read by a page of its own: the site's policy refuses a picture's pixels to a page that holds none of its own.
// Every measure the journeys take of a picture is here, behind the one decode.
type Box = [number, number, number, number];

interface Asked {
  readonly kind: "colours" | "hash";
  readonly pictures: readonly Buffer[];
  readonly boxes?: readonly Box[];
}

async function measure(page: Page, { kind, pictures, boxes = [] }: Asked) {
  const reader = await page.context().newPage();
  try {
    await reader.goto("about:blank");
    return await reader.evaluate(
      async ([wanted, encoded, cells]) => {
        const decode = async (base64: string) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext("2d");
          if (context === null) throw new Error("no canvas");
          context.drawImage(bitmap, 0, 0);
          return context.getImageData(0, 0, bitmap.width, bitmap.height);
        };
        const [first] = await Promise.all(encoded.map(decode));
        if (first === undefined) throw new Error("no picture");
        const { data, width } = first;
        // FNV-1a over the pixels from two starts: 64 bits, enough to tell any change; about:blank has no crypto.subtle.
        if (wanted === "hash") {
          let [one, two] = [0x811c9dc5, 0x9e3779b9];
          for (const byte of data) {
            one = Math.imul(one ^ byte, 0x01000193) >>> 0;
            two = Math.imul(two ^ byte, 0x01000193) >>> 0;
          }
          return [one.toString(16).padStart(8, "0") + two.toString(16).padStart(8, "0")];
        }
        return cells.map(([x0, y0, x1, y1]) => {
          let [red, green, blue] = [0, 0, 0];
          for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
              const at = (y * width + x) * 4;
              [red, green, blue] = [red + (data[at] ?? 0), green + (data[at + 1] ?? 0), blue + (data[at + 2] ?? 0)];
            }
          const pixels = (x1 - x0) * (y1 - y0);
          return [red / pixels, green / pixels, blue / pixels];
        });
      },
      [kind, pictures.map((picture) => picture.toString("base64")), boxes] as const,
    );
  } finally {
    await reader.close();
  }
}

/** The mean red, green and blue of each box of `picture` ([x0, y0, x1, y1]), from 0 to 255. */
export const colours = async (page: Page, picture: Buffer, boxes: Box[]) =>
  (await measure(page, { kind: "colours", pictures: [picture], boxes })) as [number, number, number][];

/** A 64-bit hash of a picture's decoded pixels: a 0 px pin, whatever the PNG's own encoding. */
export const pixelHash = async (page: Page, picture: Buffer) =>
  ((await measure(page, { kind: "hash", pictures: [picture] })) as string[])[0] ?? "";
