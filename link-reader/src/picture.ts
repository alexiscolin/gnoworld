// A card's picture (docs/plans/link-previews.md §4, "Decompression bombs", "SVG, HTML or a polyglot"): JPEG or PNG by magic bytes alone,
// its size read from the header before any decoding, then always a fresh JPEG of about 160 px made from the pixels (no metadata, no
// trailing bytes), at most CARD_CAPS.pictureBytes. The WebAssembly codecs are the real ones; a test hands others in.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARD_CAPS } from "@gnoworld/schemas";
import type { ReaderCard } from "@gnoworld/schemas";
import decodeJpegWasm, { init as initJpegDecoder } from "@jsquash/jpeg/decode.js";
import encodeJpegWasm, { init as initJpegEncoder } from "@jsquash/jpeg/encode.js";
import { decode as decodePngWasm, init as initPngDecoder } from "@jsquash/png/decode.js";
import resizeWasm, { initResize } from "@jsquash/resize";

export interface Raster {
  width: number;
  height: number;
  /** RGBA. */
  data: Uint8ClampedArray;
}
export interface Codecs {
  decodeJpeg(bytes: Uint8Array): Promise<Raster>;
  decodePng(bytes: Uint8Array): Promise<Raster>;
  resize(raster: Raster, width: number, height: number): Promise<Raster>;
  encodeJpeg(raster: Raster, quality: number): Promise<Uint8Array>;
}
export interface Info {
  format: "jpeg" | "png";
  width: number;
  height: number;
  /** A JPEG's colour components: 1 grey, 3 colour, 4 CMYK. */
  components: number | undefined;
}

export const SIDE_MAX = 4096;
export const PIXELS_MAX = 2_000_000;
export const SIDE_MIN = 64;
/** What a transparent pixel is drawn over (the card's surface): alpha is blended onto it, and the JPEG is opaque. */
export const SURFACE: readonly [number, number, number] = [245, 245, 245];

const u16 = (bytes: Uint8Array, at: number) => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
const u32 = (bytes: Uint8Array, at: number) => u16(bytes, at) * 65536 + u16(bytes, at + 2);
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// The frame markers (SOF0 to SOF15 but DHT, JPG and DAC): the frame's own size, not a thumbnail's inside an Exif segment, since segments are
// walked by their lengths and never searched for a marker's bytes.
const isFrame = (marker: number) => marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

function pngInfo(bytes: Uint8Array): Info | undefined {
  const signed = PNG.every((byte, at) => bytes[at] === byte) && bytes.length >= 24 && u32(bytes, 8) === 13;
  if (!signed || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return undefined;
  const [width, height] = [u32(bytes, 16), u32(bytes, 20)];
  return width > 0 && height > 0 ? { format: "png", width, height, components: undefined } : undefined;
}

interface Segment {
  marker: number;
  at: number;
  /** Bytes from `at` to the next segment. */
  size: number;
}
const standalone = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);
// The segment at `from` (fill bytes skipped), or undefined if its length runs past the file or no marker is there.
function segmentAt(bytes: Uint8Array, from: number): Segment | undefined {
  let at = from;
  if (bytes[at] !== 0xff) return undefined;
  while (bytes[at + 1] === 0xff) at += 1;
  const marker = bytes[at + 1] ?? 0;
  if (marker === 0xd9 || marker === 0xda) return { marker, at, size: 0 };
  if (standalone(marker)) return { marker, at, size: 2 };
  const length = u16(bytes, at + 2);
  return length < 2 || at + 2 + length > bytes.length ? undefined : { marker, at, size: 2 + length };
}
function frameAt(bytes: Uint8Array, at: number): Info | undefined {
  if (u16(bytes, at + 2) < 8) return undefined;
  const [height, width] = [u16(bytes, at + 5), u16(bytes, at + 7)];
  return width === 0 || height === 0 ? undefined : { format: "jpeg", width, height, components: bytes[at + 9] };
}
// The one frame of a JPEG, or undefined for none, two, a height of 0 (a DNL would set it) or a segment past the end.
function jpegInfo(bytes: Uint8Array): Info | undefined {
  if (!isJpeg(bytes)) return undefined;
  let found: Info | undefined;
  for (let from = 2; from < bytes.length;) {
    const segment = segmentAt(bytes, from);
    if (segment === undefined) return undefined;
    if (segment.size === 0) break;
    if (isFrame(segment.marker)) {
      const frame = frameAt(bytes, segment.at);
      if (found !== undefined || frame === undefined) return undefined;
      found = frame;
    }
    from = segment.at + segment.size;
  }
  return found;
}

/** The format and size a header declares, or undefined if the bytes are neither a JPEG nor a PNG with a readable header, a JPEG with no frame
 * or two, a height of 0 or a segment past the end of the file. */
export function inspect(bytes: Uint8Array): Info | undefined {
  return pngInfo(bytes) ?? jpegInfo(bytes);
}

// The WebAssembly codecs, compiled from the files of the packages (a WebAssembly module compiles under --disallow-code-generation-from-strings):
// Node has no fetch of a file: URL, which the packages would otherwise use. Each is compiled once, on first use.
const wasm = (pkg: string, file: string): Promise<WebAssembly.Module> =>
  WebAssembly.compile(readFileSync(join(dirname(fileURLToPath(import.meta.resolve(`${pkg}/package.json`))), file)));
const once = <T>(start: () => Promise<T>): (() => Promise<T>) => {
  let started: Promise<T> | undefined;
  return () => (started ??= start());
};
const ready = {
  jpegDecoder: once(async () => initJpegDecoder(await wasm("@jsquash/jpeg", "codec/dec/mozjpeg_dec.wasm"))),
  jpegEncoder: once(async () => initJpegEncoder(await wasm("@jsquash/jpeg", "codec/enc/mozjpeg_enc.wasm"))),
  png: once(async () => initPngDecoder(await wasm("@jsquash/png", "codec/pkg/squoosh_png_bg.wasm"))),
  resize: once(async () => initResize(await wasm("@jsquash/resize", "lib/resize/pkg/squoosh_resize_bg.wasm"))),
};
// The packages build an `ImageData`, which Node lacks.
if (!Reflect.has(globalThis, "ImageData")) {
  class Pixels {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      [this.data, this.width, this.height] = [data, width, height];
    }
  }
  Object.assign(globalThis, { ImageData: Pixels });
}
const buffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer;
const raster = (image: ImageData): Raster => ({ width: image.width, height: image.height, data: image.data });
const imageData = (from: Raster): ImageData => new ImageData(new Uint8ClampedArray(from.data), from.width, from.height);

export const wasmCodecs: Codecs = {
  decodeJpeg: async (bytes) => (await ready.jpegDecoder(), raster(await decodeJpegWasm(buffer(bytes)))),
  decodePng: async (bytes) => (await ready.png(), raster(await decodePngWasm(buffer(bytes)))),
  resize: async (from, width, height) => (
    await ready.resize(),
    raster(await resizeWasm(imageData(from), { width, height }))
  ),
  encodeJpeg: async (from, quality) => (
    await ready.jpegEncoder(),
    new Uint8Array(await encodeJpegWasm(imageData(from), { quality }))
  ),
};

// Alpha onto the card's surface, in place: the JPEG has none.
function flatten({ data }: Raster): void {
  for (let at = 0; at < data.length; at += 4) {
    const alpha = data[at + 3] ?? 255;
    if (alpha === 255) continue;
    SURFACE.forEach((surface, channel) => {
      data[at + channel] = Math.round(((data[at + channel] ?? 0) * alpha + surface * (255 - alpha)) / 255);
    });
    data[at + 3] = 255;
  }
}
const QUALITIES = [75, 60, 45, 30] as const;

// What a header says is too much or not a picture: a side past 4,096, over 2 Mpx, a side under 64, a JPEG that is not grey or colour.
function refused({ format, width, height, components }: Info): boolean {
  const sized = Math.max(width, height) > SIDE_MAX || width * height > PIXELS_MAX || Math.min(width, height) < SIDE_MIN;
  return sized || (format === "jpeg" && components !== 1 && components !== 3);
}

// The raster at the card's size, longest side 160 and never enlarged.
async function shrunk(from: Raster, codecs: Codecs): Promise<Raster> {
  const scale = Math.min(1, CARD_CAPS.side / Math.max(from.width, from.height));
  if (scale === 1) return from;
  return codecs.resize(from, Math.max(1, Math.round(from.width * scale)), Math.max(1, Math.round(from.height * scale)));
}

// The first quality whose JPEG fits the cap, or null.
async function compressed(from: Raster, codecs: Codecs): Promise<ReaderCard["picture"]> {
  for (const quality of QUALITIES) {
    const jpeg = await codecs.encodeJpeg(from, quality);
    if (isJpeg(jpeg) && jpeg.length <= CARD_CAPS.pictureBytes)
      return { width: from.width, height: from.height, jpeg: Buffer.from(jpeg).toString("base64") };
  }
  return null;
}

/** The card's picture from a page's image bytes, or null: it never rejects, and never decodes what its header refuses. */
export async function reencode(bytes: Uint8Array, codecs: Codecs = wasmCodecs): Promise<ReaderCard["picture"]> {
  const info = inspect(bytes);
  if (info === undefined || refused(info)) return null;
  try {
    const decoded = await (info.format === "jpeg" ? codecs.decodeJpeg(bytes) : codecs.decodePng(bytes));
    if (decoded.width !== info.width || decoded.height !== info.height) return null;
    flatten(decoded);
    return await compressed(await shrunk(decoded, codecs), codecs);
  } catch {
    return null;
  }
}
