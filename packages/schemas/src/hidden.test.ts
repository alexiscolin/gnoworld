import { describe, expect, it } from "vitest";
import { hasHidden, stripHidden } from "./hidden.ts";

// L2: one rule for control and format characters (Cc, Cf), where call.ts and the card's schemas had each their own copy.
const BIDI = "\u202e";
const ZERO_WIDTH = "\u200b";
const TAG = "\u{e0041}";
const ESC = "\u001b";

describe("hasHidden", () => {
  it.each([BIDI, ZERO_WIDTH, TAG, ESC, "\u0000", "\u007f", "\u0085", "\u00ad"])(
    "refuses U+%s style characters: %j",
    (c) => {
      expect(hasHidden(`a${c}b`)).toBe(true);
    },
  );

  it("lets plain text, an emoji with a skin tone and accents through", () => {
    expect(hasHidden("Café 👍🏽 日本語")).toBe(false);
  });

  it.each([
    "\u200d",
    "\u200e",
    "\u200f",
    "\ufeff",
    "\u2060",
    "\u2028",
    "\u2029",
    "\u3164",
    "\u115f",
    "\u1160",
    "\uffa0",
  ])("refuses the joiner and the invisible marks, U+%j", (c) => {
    expect(hasHidden(`a${c}b`)).toBe(true);
  });

  it("refuses a newline and a tab unless they are kept, as call.ts keeps them for its arguments", () => {
    expect(hasHidden("a\nb")).toBe(true);
    expect(hasHidden("a\tb")).toBe(true);
    expect(hasHidden("a\nb\tc", "\n\t")).toBe(false);
    expect(hasHidden(`a\nb${BIDI}`, "\n\t")).toBe(true);
  });
});

describe("stripHidden", () => {
  it("removes every Cc and Cf character and nothing else", () => {
    expect(stripHidden(`a${BIDI}b${ZERO_WIDTH}c${TAG}d${ESC}e\nf`)).toBe("abcdef");
    expect(stripHidden("Café 👩🏽\u200d💻")).toBe("Café 👩🏽💻");
  });

  it("keeps the characters it is told to keep", () => {
    expect(stripHidden(`a\nb${BIDI}`, "\n")).toBe("a\nb");
  });
});
