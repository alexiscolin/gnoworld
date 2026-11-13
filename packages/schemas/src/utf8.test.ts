import { describe, expect, it } from "vitest";
import * as schemas from "./index.ts";
import { jsonOfBytes, strictUtf8 } from "./utf8.ts";

const bytes = (...values: number[]) => Uint8Array.from(values);

describe("strictUtf8", () => {
  it("reads UTF-8 text whole, a character of four bytes included", () => {
    expect(strictUtf8(bytes(0x61, 0xc3, 0xa9, 0xf0, 0x9f, 0x98, 0x80))).toBe("aé\u{1f600}");
    expect(strictUtf8(new Uint8Array(0))).toBe("");
  });

  it.each([
    ["a byte that starts nothing", [0x61, 0x80]],
    ["a character cut short", [0xc3]],
    ["a long form of a short character", [0xc0, 0xaf]],
    ["a half of a pair", [0xed, 0xa0, 0x80]],
    ["a code point past Unicode", [0xf4, 0x90, 0x80, 0x80]],
    ["a byte UTF-8 never holds", [0xff]],
  ])("reads none of bytes holding %s, never a replacement character", (_, values) => {
    expect(strictUtf8(bytes(...values))).toBeNull();
  });
});

describe("jsonOfBytes", () => {
  it("reads the JSON of UTF-8 bytes, and none of bytes that are no UTF-8 or no JSON", () => {
    expect(jsonOfBytes(bytes(0x7b, 0x22, 0x61, 0x22, 0x3a, 0x31, 0x7d))).toEqual({ a: 1 });
    expect(jsonOfBytes(bytes(0x22, 0xff, 0x22))).toBeUndefined();
    expect(jsonOfBytes(bytes(0x3c, 0x68, 0x3e))).toBeUndefined();
    expect(jsonOfBytes(new Uint8Array(0))).toBeUndefined();
  });

  it("is the index's, with strictUtf8", () => {
    expect(schemas.jsonOfBytes).toBe(jsonOfBytes);
    expect(schemas.strictUtf8).toBe(strictUtf8);
  });
});
