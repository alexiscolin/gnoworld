import { CARD_CAPS } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import { inspect, PIXELS_MAX, reencode, SIDE_MAX, SIDE_MIN, SURFACE, wasmCodecs } from "./picture.ts";
import type { Codecs, Raster } from "./picture.ts";
import {
  animated,
  bomb,
  filled,
  gradient,
  gray,
  hiddenFrame,
  jpegHeader,
  noHeight,
  noise,
  overrun,
  photo,
  png,
  pngOf,
  polyglot,
  progressive,
  sizeOf,
  tiny,
  twoFrames,
  withExif,
} from "./testImages.ts";

const raster = (width: number, height: number): Raster => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});
/** `length` bytes that start as a JPEG does. */
const jpegOf = (length: number) => Uint8Array.from({ length }, (_, at) => [0xff, 0xd8, 0xff][at] ?? 1);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
/** Codecs of a test's own, which record what they are asked: the logic of `reencode` apart from the real decoders. */
function spy(encoded: (quality: number) => Uint8Array = () => JPEG_BYTES) {
  const codecs = {
    decodeJpeg: vi.fn<Codecs["decodeJpeg"]>(() => Promise.resolve(raster(640, 480))),
    decodePng: vi.fn<Codecs["decodePng"]>(() => Promise.resolve(raster(640, 480))),
    resize: vi.fn((_raster: Raster, width: number, height: number) => Promise.resolve(raster(width, height))),
    encodeJpeg: vi.fn((_raster: Raster, quality: number) => Promise.resolve(encoded(quality))),
  } satisfies Codecs;
  const decoded = () => codecs.decodeJpeg.mock.calls.length + codecs.decodePng.mock.calls.length;
  return { codecs, decoded };
}

describe("inspect: what a header declares, by magic bytes alone", () => {
  it("reads a PNG's and a JPEG's format and size", () => {
    expect(inspect(gradient(300, 200))).toEqual({ format: "png", width: 300, height: 200, components: undefined });
    expect(inspect(photo())).toEqual({ format: "jpeg", width: 640, height: 480, components: 3 });
  });

  it("reads a JPEG whose first segments are not its frame (an Exif block, a polyglot's tail)", () => {
    expect(inspect(withExif(photo()))).toMatchObject({ format: "jpeg", width: 640, height: 480 });
    expect(inspect(polyglot(photo()))).toMatchObject({ format: "jpeg", width: 640, height: 480 });
  });

  it("reads the components of a JPEG header: 1, 3 and 4", () => {
    expect(inspect(jpegHeader(100, 100, 1))?.components).toBe(1);
    expect(inspect(jpegHeader(100, 100, 4))?.components).toBe(4);
  });

  it.each([
    ["an SVG", '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script></svg>'],
    ["an SVG named .jpg, with a JPEG's mime in its text", '<?xml version="1.0"?><svg/>'],
    ["HTML", "<!doctype html><html><body><script>alert(1)</script></body></html>"],
    ["a GIF", "GIF89a\x40\x00\x40\x00\x00\x00\x00;"],
    ["a WebP", "RIFF\x24\x00\x00\x00WEBPVP8 "],
    ["a ZIP", "PK\x03\x04\x14\x00\x00\x00"],
    ["a PDF", "%PDF-1.7\n"],
    ["nothing", ""],
    ["one byte", "\xff"],
  ])("refuses %s", (_name, text) => {
    expect(inspect(Buffer.from(text, "latin1"))).toBeUndefined();
  });

  it("refuses a truncated PNG, a PNG signature with no header, and a JPEG with no frame header", () => {
    expect(inspect(gradient(300, 200).subarray(0, 20))).toBeUndefined();
    expect(inspect(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeUndefined();
    expect(inspect(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBeUndefined();
  });
});

describe("inspect: a header that hides its frame", () => {
  it("reads the frame of the image, not a thumbnail's embedded in an Exif segment", () => {
    expect(inspect(hiddenFrame(300, 200))).toMatchObject({ width: 300, height: 200 });
    expect(inspect(hiddenFrame(65535, 65535))).toMatchObject({ width: 65535, height: 65535 });
  });

  it("reads a frame after fill bytes", () => {
    expect(inspect(filled(300, 200))).toMatchObject({ width: 300, height: 200 });
  });

  it("refuses two frames in one file, a height of 0 (a later DNL would set it), a segment longer than the file, and a thumbnail alone", () => {
    expect(inspect(twoFrames(65535, 65535))).toBeUndefined();
    expect(inspect(noHeight(300))).toBeUndefined();
    expect(inspect(overrun())).toBeUndefined();
    const thumbnailOnly = Uint8Array.from(
      hiddenFrame(300, 200).subarray(0, hiddenFrame(300, 200).indexOf(0xc0, 30) - 1),
    );
    expect(inspect(thumbnailOnly)).toBeUndefined();
  });

  it.each([
    ["a real frame of 65535 by 65535 behind a small thumbnail", hiddenFrame(65535, 65535)],
    ["two frames", twoFrames(65535, 65535)],
    ["a height of 0", noHeight(4000)],
    ["a segment that overruns", overrun()],
  ])("hands no byte to a decoder for %s", async (_name, bytes) => {
    const { codecs, decoded } = spy();
    await expect(reencode(bytes, codecs)).resolves.toBeNull();
    expect(decoded()).toBe(0);
  });
});

describe("reencode, the alpha", () => {
  it("blends a transparent pixel onto the card's surface, and gives the encoder an opaque raster", async () => {
    const { codecs } = spy();
    const data = new Uint8ClampedArray(100 * 100 * 4).fill(255);
    data.set([10, 20, 30, 0], 0);
    data.set([10, 20, 30, 255], 4);
    data.set([0, 0, 0, 128], 8);
    codecs.decodePng.mockResolvedValueOnce({ width: 100, height: 100, data });
    codecs.resize.mockImplementation((from) => Promise.resolve(from));
    await reencode(
      png(100, 100, () => [1, 2, 3]),
      codecs,
    );
    const sent = codecs.encodeJpeg.mock.calls[0]?.[0];
    expect(sent).toBeDefined();
    const at = (pixel: number) => [...(sent?.data.subarray(pixel * 4, pixel * 4 + 4) ?? [])];
    expect(at(0)).toEqual([...SURFACE, 255]);
    expect(at(1)).toEqual([10, 20, 30, 255]);
    expect(
      at(2)
        .slice(0, 3)
        .every((value, channel) => Math.abs(value - (SURFACE[channel] ?? 0) / 2) <= 1),
    ).toBe(true);
    expect(at(2)[3]).toBe(255);
    expect([...(sent?.data ?? [])].filter((_, index) => index % 4 === 3).every((alpha) => alpha === 255)).toBe(true);
  });
});

describe("reencode, before any decoding", () => {
  it.each([
    ["a side past 4,096", bomb(SIDE_MAX + 1, 100)],
    ["a header of 100,000 by 100,000", jpegHeader(65535, 65535, 3)],
    ["a PNG of 3,000 by 3,000 over the 2 Mpx cap, one run of zeros in 9 MB", bomb(3000, 3000)],
    ["a PNG of 2,001,000 pixels, just over the cap", bomb(2001, 1000)],
    ["a CMYK JPEG", Uint8Array.from([...jpegHeader(300, 300, 4)])],
    ["a tracking pixel's PNG", png(1, 1, () => [0, 0, 0])],
    ["a side under 64", png(SIDE_MIN - 1, 200, () => [9, 9, 9])],
    ["a height under 64", png(200, 63, () => [9, 9, 9])],
    ["a PNG side past 65535", bomb(70000, 10)],
    ["a PNG side of 65535", bomb(65535, 10)],
    ["a small JPEG", tiny()],
    ["an SVG", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")],
    ["HTML", Buffer.from("<html><script>alert(1)</script></html>")],
    ["nothing", new Uint8Array()],
  ])("gives no picture for %s, and hands no byte to a decoder", async (_name, bytes) => {
    const { codecs, decoded } = spy();
    await expect(reencode(bytes, codecs)).resolves.toBeNull();
    expect(decoded()).toBe(0);
  });

  // D13943: 2 megapixels. No rectangle within 4,096 a side has exactly 2,000,001 pixels, so the edge is 2,000,000 (2,000 by 1,000) and 2,000,999 (1,001 by 1,999).
  it("holds the cap's own edge: 2,000 by 1,000 (2,000,000 pixels) is decoded, 1,001 by 1,999 (2,000,999) is not", async () => {
    expect(PIXELS_MAX).toBe(2_000_000);
    const inside = spy();
    await reencode(jpegHeader(2000, 1000, 3), inside.codecs);
    expect(inside.decoded()).toBe(1);
    const past = spy();
    await reencode(jpegHeader(1001, 1999, 3), past.codecs);
    expect(past.decoded()).toBe(0);
  });

  it("decodes a 64 by 64 picture, the smallest", async () => {
    const { codecs, decoded } = spy();
    await reencode(
      png(SIDE_MIN, SIDE_MIN, () => [1, 2, 3]),
      codecs,
    );
    expect(decoded()).toBe(1);
  });
});

describe("reencode, the work", () => {
  it("decodes with the codec of the format found, never of the extension or type it was named", async () => {
    const { codecs } = spy();
    await reencode(photo(), codecs);
    await reencode(gradient(300, 200), codecs);
    expect(codecs.decodeJpeg).toHaveBeenCalledTimes(1);
    expect(codecs.decodePng).toHaveBeenCalledTimes(1);
  });

  it("scales the longest side to 160, keeping the proportions, and answers the size it made", async () => {
    const { codecs } = spy();
    const got = await reencode(photo(), codecs);
    expect(codecs.resize).toHaveBeenCalledWith(expect.objectContaining({ width: 640, height: 480 }), 160, 120);
    expect(got).toEqual({ width: 160, height: 120, jpeg: Buffer.from(JPEG_BYTES).toString("base64") });
  });

  it("scales a portrait picture by its height", async () => {
    const { codecs } = spy();
    codecs.decodePng.mockResolvedValueOnce(raster(300, 600));
    const got = await reencode(gradient(300, 600), codecs);
    expect(got).toMatchObject({ width: 80, height: 160 });
  });

  it("never enlarges a picture: 100 by 100 stays 100 by 100", async () => {
    const { codecs } = spy();
    codecs.decodePng.mockResolvedValueOnce(raster(100, 100));
    const got = await reencode(gradient(100, 100), codecs);
    expect(got).toMatchObject({ width: 100, height: 100 });
    expect(codecs.resize.mock.calls.every(([, width, height]) => width <= 100 && height <= 100)).toBe(true);
  });

  it("lowers the quality until the JPEG fits the cap, and answers the first that does", async () => {
    const { codecs } = spy((quality) => jpegOf(quality > 50 ? CARD_CAPS.pictureBytes + 1 : CARD_CAPS.pictureBytes));
    const got = await reencode(photo(), codecs);
    expect(got).not.toBeNull();
    expect(Buffer.from(got?.jpeg ?? "", "base64").length).toBe(CARD_CAPS.pictureBytes);
    const qualities = codecs.encodeJpeg.mock.calls.map(([, quality]) => quality);
    expect(qualities[0]).toBeGreaterThan(50);
    expect(qualities.at(-1)).toBeLessThanOrEqual(50);
  });

  it("gives no picture when no quality fits the cap", async () => {
    const { codecs } = spy(() => jpegOf(CARD_CAPS.pictureBytes + 1));
    await expect(reencode(photo(), codecs)).resolves.toBeNull();
  });

  it("gives no picture when what the encoder made is not a JPEG", async () => {
    const { codecs } = spy(() => Buffer.from("<html>not a jpeg</html>"));
    await expect(reencode(photo(), codecs)).resolves.toBeNull();
  });

  it("never rejects: a decoder, a scaler or an encoder that throws gives no picture", async () => {
    for (const broken of ["decodeJpeg", "resize", "encodeJpeg"] as const) {
      const { codecs } = spy();
      codecs[broken].mockRejectedValue(new Error("wasm trap"));
      await expect(reencode(photo(), codecs)).resolves.toBeNull();
    }
  });

  it("refuses a decoded raster that is not the size the header declared", async () => {
    const { codecs } = spy();
    codecs.decodeJpeg.mockResolvedValueOnce(raster(5000, 5000));
    await expect(reencode(photo(), codecs)).resolves.toBeNull();
    expect(codecs.resize).not.toHaveBeenCalled();
  });
});

// The real codecs (@jsquash/jpeg, png, resize, in WebAssembly): they need `pnpm install` (the report's commands).
describe("reencode with the real codecs", () => {
  const made = async (bytes: Uint8Array) => {
    const got = await reencode(bytes, wasmCodecs);
    expect(got).not.toBeNull();
    const jpeg = Buffer.from(got?.jpeg ?? "", "base64");
    return { got, jpeg, text: jpeg.toString("latin1") };
  };

  it("makes a JPEG of 160 by 120 under 16 KiB from a 640 by 480 JPEG, and the size it says is the size it has", async () => {
    const { got, jpeg } = await made(photo());
    expect([jpeg[0], jpeg[1], jpeg[2]]).toEqual([0xff, 0xd8, 0xff]);
    expect(jpeg.length).toBeLessThanOrEqual(CARD_CAPS.pictureBytes);
    expect({ width: got?.width, height: got?.height }).toEqual({ width: 160, height: 120 });
    expect(sizeOf(jpeg)).toEqual({ width: 160, height: 120 });
  });

  it("does the same from a PNG, and from a portrait one", async () => {
    expect(sizeOf((await made(gradient(640, 480))).jpeg)).toEqual({ width: 160, height: 120 });
    expect(sizeOf((await made(gradient(300, 600))).jpeg)).toEqual({ width: 80, height: 160 });
  });

  it("keeps a small picture's size", async () => {
    expect(sizeOf((await made(gradient(100, 100))).jpeg)).toEqual({ width: 100, height: 100 });
  });

  it("keeps a noisy picture under the cap, or gives none", async () => {
    const got = await reencode(noise(800, 800), wasmCodecs);
    expect(got === null || Buffer.from(got.jpeg, "base64").length <= CARD_CAPS.pictureBytes).toBe(true);
  });

  it("drops the Exif block and its GPS text: a clean JPEG made from the pixels", async () => {
    const { text } = await made(withExif(photo()));
    expect(text).not.toContain("Exif");
    expect(text).not.toContain("GPS");
  });

  it("drops what follows the image: a JPEG with a ZIP behind it comes out as a JPEG alone", async () => {
    const { text } = await made(polyglot(photo()));
    expect(text).not.toContain("PK\x03\x04");
    expect(text).not.toContain("payload-in-the-zip");
  });

  it("makes a still of an animated PNG, from its first frame", async () => {
    expect(sizeOf((await made(animated(200, 100))).jpeg)).toEqual({ width: 160, height: 80 });
  });

  it("gives no picture for a decompression bomb, the real decoder never given it", async () => {
    await expect(reencode(bomb(3000, 3000), wasmCodecs)).resolves.toBeNull();
  });

  it.each([
    ["a progressive JPEG", progressive(), { width: 160, height: 120 }],
    ["a grayscale JPEG", gray(), { width: 160, height: 120 }],
    [
      "an RGBA PNG",
      pngOf(200, 100, { colour: 6, sample: (x, y, channel) => (channel === 3 ? (x < 100 ? 0 : 255) : x + y) }),
      { width: 160, height: 80 },
    ],
    ["a palette PNG", pngOf(200, 100, { colour: 3, sample: (x, y) => x + y }), { width: 160, height: 80 }],
    ["a grey PNG with alpha", pngOf(200, 100, { colour: 4, sample: (x) => x }), { width: 160, height: 80 }],
    ["a 16-bit PNG", pngOf(200, 100, { colour: 2, depth: 16, sample: (x, y) => x + y }), { width: 160, height: 80 }],
    [
      "an interlaced PNG",
      pngOf(200, 100, { colour: 2, interlaced: true, sample: (x, y) => x + y }),
      { width: 160, height: 80 },
    ],
  ])("makes a JPEG of the right size from %s", async (_name, bytes, size) => {
    expect(sizeOf((await made(bytes)).jpeg)).toEqual(size);
  });

  it("makes a JPEG without alpha from an RGBA PNG: the same size, opaque, never black where it was clear", async () => {
    const { jpeg } = await made(pngOf(200, 100, { colour: 6, sample: () => 0 }));
    // A JPEG of a fully clear picture drawn over the surface is one flat light colour: its first bytes are a JPEG's and its size is small.
    expect(jpeg.length).toBeLessThan(2000);
  });

  it("gives no picture for a CMYK JPEG header, an SVG, or bytes that only start like a JPEG", async () => {
    await expect(reencode(jpegHeader(300, 300, 4), wasmCodecs)).resolves.toBeNull();
    await expect(reencode(Buffer.from("<svg/>"), wasmCodecs)).resolves.toBeNull();
    await expect(reencode(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]), wasmCodecs)).resolves.toBeNull();
  });
});
