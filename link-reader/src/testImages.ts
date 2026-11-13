// Pictures made for the tests: PNGs written with the standard library alone, the JPEGs of testdata/ (photo.jpg: 640x480, cjpeg quality 70;
// tiny.jpg: 40x40) and byte-level edits of them. Nothing here is the code under test.
import { readFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

export const photo = (): Uint8Array => readFileSync(new URL("./testdata/photo.jpg", import.meta.url));
export const progressive = (): Uint8Array => readFileSync(new URL("./testdata/progressive.jpg", import.meta.url));
export const gray = (): Uint8Array => readFileSync(new URL("./testdata/gray.jpg", import.meta.url));
export const tiny = (): Uint8Array => readFileSync(new URL("./testdata/tiny.jpg", import.meta.url));

const chunk = (type: string, data: Uint8Array): Buffer => {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
};
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const header = (width: number, height: number, colour: number): Buffer => {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.set([8, colour, 0, 0, 0], 8);
  return chunk("IHDR", data);
};

interface Size {
  width: number;
  height: number;
}
type Pixel = (x: number, y: number) => [number, number, number];
const rgb = ({ width, height }: Size, pixel: Pixel, extra: Buffer[]): Uint8Array => {
  const rows = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) rows.set(pixel(x, y), y * (1 + width * 3) + 1 + x * 3);
  return Buffer.concat([
    SIGNATURE,
    header(width, height, 2),
    ...extra,
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
/** An 8-bit RGB PNG, each pixel from `pixel(x, y)`. */
export const png = (width: number, height: number, pixel: Pixel): Uint8Array => rgb({ width, height }, pixel, []);
export const gradient = (width: number, height: number) =>
  png(width, height, (x, y) => [(x * 255) / width, (y * 255) / height, ((x + y) * 255) / (width + height)]);
/** Pseudo-random pixels: hard to compress, so a JPEG of it is large. */
export const noise = (width: number, height: number) => {
  let seed = 12345;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 7;
  return png(width, height, () => [next() & 255, next() & 255, next() & 255]);
};
/** A PNG whose header says `width` by `height` of grey and whose data is one huge run of zeros: tiny to send, huge to decode. */
export function bomb(width: number, height: number): Uint8Array {
  const zeros = Buffer.alloc(height * (1 + width));
  return Buffer.concat([
    SIGNATURE,
    header(width, height, 0),
    chunk("IDAT", deflateSync(zeros)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
/** An animated PNG: the same picture with an `acTL` chunk (two frames declared, the default image first). */
export function animated(width: number, height: number): Uint8Array {
  const control = Buffer.alloc(8);
  control.writeUInt32BE(2, 0);
  return rgb({ width, height }, (x, y) => [x & 255, y & 255, 128], [chunk("acTL", control)]);
}
/** A JPEG header alone (SOI, SOF0 of `components`, `width` by `height`): enough to be read, never enough to decode. */
export function jpegHeader(width: number, height: number, components: number): Uint8Array {
  const frame = Buffer.alloc(8 + components * 3);
  frame.writeUInt16BE(frame.length, 0);
  frame[2] = 8;
  frame.writeUInt16BE(height, 3);
  frame.writeUInt16BE(width, 5);
  frame[7] = components;
  for (let at = 0; at < components; at++) frame.set([at + 1, 0x11, 0], 8 + at * 3);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0]), frame]);
}
/** The JPEG with an Exif segment (a GPS tag's text in it) right after SOI. */
export function withExif(jpeg: Uint8Array): Uint8Array {
  const payload = Buffer.from("Exif\0\0GPSLatitude 48.85 GPSLongitude 2.35", "latin1");
  const segment = Buffer.alloc(4);
  segment.set([0xff, 0xe1]);
  segment.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), segment, payload, jpeg.subarray(2)]);
}
/** A JPEG with a ZIP's local-file header appended: both formats read it. */
export const polyglot = (jpeg: Uint8Array): Uint8Array =>
  Buffer.concat([jpeg, Buffer.from("PK\x03\x04hidden.txt payload-in-the-zip", "latin1")]);
/** A JPEG's size from its first frame header. */
export function sizeOf(jpeg: Uint8Array): { width: number; height: number } | undefined {
  for (let at = 2; at + 9 < jpeg.length;) {
    const marker = jpeg[at + 1] ?? 0;
    if (marker >= 0xc0 && marker <= 0xc2) {
      const view = new DataView(jpeg.buffer, jpeg.byteOffset);
      return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    }
    at += 2 + new DataView(jpeg.buffer, jpeg.byteOffset).getUint16(at + 2);
  }
  return undefined;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** A PNG of any colour type (0 grey, 2 RGB, 3 palette, 4 grey+alpha, 6 RGBA) and depth (8 or 16), optionally Adam7-interlaced; each sample is
 * `sample(x, y, channel)` (0 to 255, written as two bytes at 16 bits); a palette image gets a 256-entry palette. */
export function pngOf(
  width: number,
  height: number,
  {
    colour,
    depth = 8,
    interlaced = false,
    sample,
  }: {
    colour: number;
    depth?: 8 | 16;
    interlaced?: boolean;
    sample: (x: number, y: number, channel: number) => number;
  },
): Uint8Array {
  const channels = CHANNELS[colour] ?? 1;
  const bytes = channels * (depth / 8);
  const rows = (points: [number, number][], span: number): Buffer => {
    const out: Buffer[] = [];
    for (let line = 0; line < points.length; line += span) {
      const row = Buffer.alloc(1 + span * bytes);
      for (let at = 0; at < span; at++) {
        const [x, y] = points[line + at] ?? [0, 0];
        for (let channel = 0; channel < channels; channel++) {
          const value = sample(x, y, channel) & 255;
          row.set(depth === 16 ? [value, value] : [value], 1 + at * bytes + channel * (depth / 8));
        }
      }
      out.push(row);
    }
    return Buffer.concat(out);
  };
  const plain = (): Buffer => {
    const points: [number, number][] = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) points.push([x, y]);
    return rows(points, width);
  };
  const adam7 = (): Buffer => {
    const passes: [number, number, number, number][] = [
      [0, 0, 8, 8],
      [4, 0, 8, 8],
      [0, 4, 4, 8],
      [2, 0, 4, 4],
      [0, 2, 2, 4],
      [1, 0, 2, 2],
      [0, 1, 1, 2],
    ];
    return Buffer.concat(
      passes.map(([x0, y0, dx, dy]) => {
        const out: Buffer[] = [];
        for (let y = y0; y < height; y += dy) {
          const points: [number, number][] = [];
          for (let x = x0; x < width; x += dx) points.push([x, y]);
          if (points.length > 0) out.push(rows(points, points.length));
        }
        return Buffer.concat(out);
      }),
    );
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head.set([depth, colour, 0, 0, interlaced ? 1 : 0], 8);
  const palette =
    colour === 3 ? [chunk("PLTE", Buffer.from(Array.from({ length: 768 }, (_, at) => (at * 7) & 255)))] : [];
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", head),
    ...palette,
    chunk("IDAT", deflateSync(interlaced ? adam7() : plain())),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const segment = (marker: number, payload: Buffer): Buffer => {
  const out = Buffer.alloc(4 + payload.length);
  out.set([0xff, marker]);
  out.writeUInt16BE(payload.length + 2, 2);
  out.set(payload, 4);
  return out;
};
const frame = (marker: number, [width, height]: [number, number], components = 3): Buffer => {
  const payload = Buffer.alloc(6 + components * 3);
  payload[0] = 8;
  payload.writeUInt16BE(height, 1);
  payload.writeUInt16BE(width, 3);
  payload[5] = components;
  for (let at = 0; at < components; at++) payload.set([at + 1, 0x11, 0], 6 + at * 3);
  return segment(marker, payload);
};
const SOI = Buffer.from([0xff, 0xd8]);
/** SOI, an APP1 whose payload embeds a small JPEG thumbnail (with its own SOF of 100 by 100), then the real frame of `width` by `height`. */
export const hiddenFrame = (width: number, height: number): Uint8Array =>
  Buffer.concat([
    SOI,
    segment(0xe1, Buffer.concat([Buffer.from("Exif\0\0"), SOI, frame(0xc0, [100, 100])])),
    frame(0xc0, [width, height]),
  ]);
/** Two frames in one file: 100 by 100 and then `width` by `height` (a decoder may take either). */
export const twoFrames = (width: number, height: number): Uint8Array =>
  Buffer.concat([SOI, frame(0xc0, [100, 100]), frame(0xc2, [width, height])]);
/** A frame of height 0 (the real height comes in a DNL segment after the scan). */
export const noHeight = (width: number): Uint8Array => Buffer.concat([SOI, frame(0xc0, [width, 0])]);
/** A segment whose length runs past the end of the file. */
export const overrun = (): Uint8Array =>
  Buffer.concat([SOI, Buffer.from([0xff, 0xe1, 0xff, 0xff]), Buffer.from("short")]);
/** Fill bytes (0xFF 0xFF) before a marker, which the format allows, then a real frame. */
export const filled = (width: number, height: number): Uint8Array =>
  Buffer.concat([SOI, Buffer.from([0xff, 0xff, 0xff]), frame(0xc0, [width, height])]);
