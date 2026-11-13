import { describe, expect, it } from "vitest";
import { HIDDEN } from "../args/args.ts";
import * as core from "../index.ts";
import { hasHidden, stripHidden } from "./hidden.ts";

describe("one list of hidden characters", () => {
  it("is what a call's argument may not hold, but a newline and a tab, on every code point", () => {
    const apart: number[] = [];
    for (let code = 0; code <= 0x10ffff; code += 1) {
      if (code >= 0xd800 && code <= 0xdfff) continue;
      const char = String.fromCodePoint(code);
      if (hasHidden(char, "\n\t") !== HIDDEN.test(char)) apart.push(code);
    }
    expect(apart).toEqual([]);
  });

  it("holds the line and paragraph separators and the Hangul fillers, which draw as nothing", () => {
    expect(["\u2028", "\u2029", "\u115F", "\u1160", "\u3164", "\uFFA0"].filter((char) => !hasHidden(char))).toEqual([]);
    expect(stripHidden("a\u3164b\u2028c\nd", "\n")).toBe("abc\nd");
  });

  it("is the index's", () => {
    expect(core.hasHidden).toBe(hasHidden);
    expect(core.stripHidden).toBe(stripHidden);
  });
});
