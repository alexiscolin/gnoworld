import { describe, expect, it } from "vitest";
import * as core from "../index.ts";
import { utf8Bytes } from "./utf8.ts";

describe("utf8Bytes", () => {
  it("counts each character's UTF-8 width, a lone half of a pair as the three bytes of what replaces it", () => {
    const counted = ["a", "é", "߿", "ࠀ", "€", "￿", "\u{10000}", "\u{1f600}", "\ud800", "\udc00"];
    expect(counted.map((text) => utf8Bytes(text))).toEqual([1, 2, 2, 3, 3, 3, 4, 4, 3, 3]);
    expect(utf8Bytes("caf\u00e9 \u{1f600}")).toBe(10);
  });

  it("stops counting past its limit, so a long text costs no more than the limit", () => {
    expect(utf8Bytes("a".repeat(10), 4)).toBe(5);
    expect(utf8Bytes("€".repeat(10), 4)).toBe(6);
    expect(utf8Bytes("a".repeat(4), 4)).toBe(4);
  });

  it("is the index's", () => {
    expect(core.utf8Bytes).toBe(utf8Bytes);
  });
});
