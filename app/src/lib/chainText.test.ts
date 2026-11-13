import { describe, expect, it } from "vitest";
import { cut, plain } from "./chainText.ts";

// The chain's words as a page draws them: plain text, cut by what a reader sees as one character, never in the middle of an emoji.
const FAMILY = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
const FLAG = "\u{1F1EF}\u{1F1F5}";

describe("the chain's words", () => {
  it("keep a family emoji whole and joined, and never show half a flag", () => {
    expect(cut(`x${FAMILY}`, 2)).toBe(`x${FAMILY}`);
    expect(cut(`abc${FLAG}`, 4)).toBe(`abc${FLAG}`);
    expect(cut(`abc${FLAG}`, 3)).toBe("abc");
  });

  it("drop the format and control characters, a bidi override among them, and read a line break as a space", () => {
    expect(plain(`Gno\u202E\nToken`)).toBe("Gno Token");
  });

  it("cut a long text at its count of characters", () => {
    expect(plain("a".repeat(100))).toBe("a".repeat(64));
  });
});
