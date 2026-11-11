import { describe, expect, it } from "vitest";
import { jpegSize } from "./jpeg.ts";

// The picture's real size is read from its first frame header; the reader's claim about it is never taken (slice 13, L3).
const SOI = [0xff, 0xd8];
const be = (n: number): number[] => [n >> 8, n & 0xff];
/** A segment: marker, a length that counts itself, then the payload. */
const segment = (marker: number, payload: number[]): number[] => [0xff, marker, ...be(payload.length + 2), ...payload];
/** A frame header: precision, height, width, then the components. */
const frame = (marker: number, width: number, height: number): number[] =>
  segment(marker, [8, ...be(height), ...be(width), 1, 1, 0x11, 0]);
const jpeg = (...parts: number[][]): Uint8Array => Uint8Array.from([...SOI, ...parts.flat()]);

describe("jpegSize", () => {
  it("reads the size of a baseline frame, a side of more than 255 px as well", () => {
    expect(jpegSize(jpeg(frame(0xc0, 640, 480)))).toEqual({ width: 640, height: 480 });
  });

  it("walks past the segments before the frame, whatever their lengths", () => {
    const app0 = segment(
      0xe0,
      Array.from({ length: 14 }, () => 7),
    );
    const table = segment(
      0xdb,
      Array.from({ length: 65 }, () => 1),
    );
    expect(jpegSize(jpeg(app0, table, frame(0xc2, 300, 200)))).toEqual({ width: 300, height: 200 });
  });

  it("walks past a segment whose marker is under the frame markers", () => {
    expect(jpegSize(jpeg(segment(0xb0, [1, 2, 3, 4]), frame(0xc0, 20, 10)))).toEqual({ width: 20, height: 10 });
  });

  it.each([
    [0xc1, "extended sequential"],
    [0xc2, "progressive"],
    [0xcf, "the last of the range"],
  ])("takes the frame marker %i (%s)", (marker) => {
    expect(jpegSize(jpeg(frame(marker, 50, 40)))).toEqual({ width: 50, height: 40 });
  });

  it.each([
    [0xc4, "the Huffman table"],
    [0xc8, "the JPEG extension"],
    [0xcc, "the arithmetic conditioning"],
  ])("does not take %i (%s) for a frame: the real one after it gives the size", (marker) => {
    const other = segment(
      marker,
      Array.from({ length: 12 }, () => 0),
    );
    expect(jpegSize(jpeg(other, frame(0xc0, 70, 60)))).toEqual({ width: 70, height: 60 });
  });

  it("has no size for a stream that does not go on with a marker", () => {
    expect(jpegSize(Uint8Array.from([...SOI, 0, 0xc0, 0, 17, 8, 0, 10, 0, 10, 1, 1, 0x11, 0, 0, 0]))).toBeUndefined();
  });

  it("has no size for a stream with no frame", () => {
    expect(jpegSize(jpeg(segment(0xe0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])))).toBeUndefined();
    expect(jpegSize(new Uint8Array())).toBeUndefined();
  });

  it("has no size for a frame header cut short, not a size of zeros", () => {
    expect(jpegSize(Uint8Array.from([...SOI, 0xff, 0xc0, 0, 17]))).toBeUndefined();
    // ends on the width's last byte: a header that short is no picture's
    expect(jpegSize(Uint8Array.from([...SOI, 0xff, 0xc0, 0, 17, 8, 0, 10, 0, 10]))).toBeUndefined();
  });

  it("ends on a segment that says it is far longer than the stream", () => {
    expect(
      jpegSize(
        jpeg(
          [0xff, 0xe0, 0xff, 0xff],
          Array.from({ length: 20 }, () => 0),
        ),
      ),
    ).toBeUndefined();
  });
});
