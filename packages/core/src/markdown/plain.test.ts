import { describe, expect, test, vi } from "vitest";
import { isBlank } from "./nodes.ts";
import { cutGraphemes, excerpt, firstGraphemes, plain } from "./plain.ts";

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";

// 4d: a reply quotes the line it answers in one line of words, as the room reads it: its marks gone, its parts joined
// by a space; what the room shows as text stays text (R5).
describe("plain: a message's words in one line", () => {
  // The green pass (G10): a quote's lines joined by a space, and nothing left at the ends.
  test("joins a quote's lines by a space, an empty one between them", () => {
    expect(plain("> a\n>\n> b")).toBe("a b");
  });

  test("leaves no space at the end, an empty code block after the words", () => {
    expect(plain("a\n\n```\n```")).toBe("a");
  });

  test.each([
    ["marks", "**bold**, _em_, ~~gone~~ and `code`", "bold, em, gone and code"],
    ["a link, by its words", "see [the docs](https://gno.land/docs)", "see the docs"],
    ["a bare link, by its address", "see https://gno.land/r/demo", "see https://gno.land/r/demo"],
    ["a mention, by its address", `hi @${ALICE}`, `hi @${ALICE}`],
    ["paragraphs and a break", "one\ntwo\n\nthree", "one two three"],
    ["a list", "- one\n- two", "one two"],
    ["a numbered list", "3. one\n4. two", "one two"],
    ["a quote", "> said\n\nreply", "said reply"],
    ["fenced code", "```\nlet a\nlet b\n```", "let a let b"],
    ["spaces", "  a   b  ", "a b"],
    ["nothing", "", ""],
  ])("reads %s as words", (_, source, words) => {
    expect(plain(source)).toBe(words);
  });

  // R5: markup and a link of another scheme are no element in the room; their words stay as written.
  test.each([
    ["markup", "<img src=x onerror=alert(1)> <script>alert(1)</script>"],
    ["a link of another scheme, which the room shows as written", "[x](javascript:alert(1))"],
  ])("keeps %s as its text", (_, source) => {
    expect(plain(source)).toBe(source);
  });
});

// R6: a quote holds 70 characters, the composer's reply bar 60, cut with "…" between two graphemes, never inside one.
describe("excerpt: a message's words cut to a length", () => {
  const a = (count: number) => "a".repeat(count);

  test("keeps words within the length whole", () => {
    expect(excerpt(a(70), 70)).toBe(a(70));
  });

  test("cuts longer words to the length, its last character an ellipsis", () => {
    expect(excerpt(a(71), 70)).toBe(`${a(69)}…`);
  });

  test("reads the words first: marks count for nothing", () => {
    expect(excerpt(`**${a(70)}**`, 70)).toBe(a(70));
  });

  test.each([
    ["a skin-toned emoji", "👍🏽"],
    ["a family joined by ZWJs", "👩‍👩‍👧‍👦"],
    ["a flag", "🇫🇷"],
    ["a letter beyond the BMP", "𝒜"],
    ["a letter and its accent", "é"],
  ])("keeps %s whole on the cut, by grapheme", (_, grapheme) => {
    expect(excerpt(`${a(68)}${grapheme}${a(5)}`, 70)).toBe(`${a(68)}${grapheme}…`);
    expect(excerpt(`${a(68)}${grapheme}a`, 70)).toBe(`${a(68)}${grapheme}a`);
  });

  // The green pass (G10): the shortest length a cut takes.
  test("cuts to two graphemes, the first and the ellipsis", () => {
    expect(excerpt("abc", 2)).toBe("a…");
  });

  test.each([0, 1, 1.5, Number.NaN])("refuses a length of %s", (length) => {
    expect(() => excerpt("words", length)).toThrow(RangeError);
  });
});

// F1723 (C1): a reply quotes its parent's first 69 graphemes and a delete's dialog its first 80, from a parent of up to
// 4096 bytes: the text is cut to a few units before it is segmented, not segmented whole.
describe("firstGraphemes: the first graphemes of a text, the rest never segmented", () => {
  test("segments no more than eight units a grapheme asked for, of a long text", () => {
    const segment = vi.spyOn(Intl.Segmenter.prototype, "segment");
    try {
      expect(firstGraphemes("a".repeat(4096), 70)).toEqual(Array.from({ length: 70 }, () => "a"));
      expect(segment.mock.calls.map(([text]) => text.length)).toEqual([560]);
    } finally {
      segment.mockRestore();
    }
  });

  test("gives the whole text, segmented, when it is within the cut", () => {
    const segment = vi.spyOn(Intl.Segmenter.prototype, "segment");
    try {
      expect(firstGraphemes("abc", 70)).toEqual(["a", "b", "c"]);
      expect(segment).toHaveBeenCalledTimes(1);
    } finally {
      segment.mockRestore();
    }
    expect(firstGraphemes("", 70)).toEqual([]);
  });

  test("keeps a grapheme whole where the cut would split it, and reads a text of long graphemes whole", () => {
    const long = `a${"\u0301".repeat(20)}`;
    expect(firstGraphemes(long.repeat(10), 5)).toEqual(Array.from({ length: 5 }, () => long));
    expect(firstGraphemes(`${"a".repeat(558)}👍🏽${"b".repeat(100)}`, 559)).toEqual([
      ...Array.from({ length: 558 }, () => "a"),
      "👍🏽",
    ]);
  });

  test("agrees with the whole text's segmentation on any text and count", () => {
    const whole = (text: string, count: number) =>
      [...new Intl.Segmenter().segment(text)].slice(0, count).map(({ segment }) => segment);
    for (const text of [
      "x".repeat(9000),
      "👩‍👩‍👧‍👦é🇫🇷a".repeat(300),
      `${"a\u0301".repeat(400)}z`,
      "é".repeat(20) + "\u0301",
    ]) {
      for (const count of [1, 2, 20, 69, 70, 81, 500])
        expect(firstGraphemes(text, count), `${text.slice(0, 8)} ${String(count)}`).toEqual(whole(text, count));
    }
  });
});

describe("cutGraphemes: a text cut to a length", () => {
  test("keeps a text that fits, and ends a longer one with an ellipsis at the length", () => {
    expect(cutGraphemes("abcd", 4)).toBe("abcd");
    expect(cutGraphemes("abcde", 4)).toBe("abc…");
  });

  test("never cuts a grapheme in two, a flag and a family included", () => {
    expect(cutGraphemes("🇫🇷🇫🇷🇫🇷🇫🇷", 3)).toBe("🇫🇷🇫🇷…");
    expect(cutGraphemes("a👨‍👩‍👧b", 2)).toBe("a…");
  });

  test("refuses a length that is not a whole number of 2 or more", () => {
    for (const length of [1, 0, -1, 2.5, Number.NaN]) expect(() => cutGraphemes("abc", length)).toThrow(RangeError);
  });
});

describe("isBlank: whether a text draws nothing", () => {
  test("is true for spaces, format characters and the braille blank, and false for any letter", () => {
    for (const blank of ["", " \t", "\u200b", "\u3164", "\u2800", "\u202e"]) expect(isBlank(blank)).toBe(true);
    for (const shown of ["a", " a ", "\u2800a", "."]) expect(isBlank(shown)).toBe(false);
  });
});
