import { describe, expect, test } from "vitest";
import { excerpt, plain } from "./plain.ts";

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";

// 4d: a reply quotes the line it answers in one line of words, as the room reads it: its marks gone, its parts joined
// by a space; what the room shows as text stays text (R5).
describe("plain: a message's words in one line", () => {
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

  test.each([0, 1, 1.5, Number.NaN])("refuses a length of %s", (length) => {
    expect(() => excerpt("words", length)).toThrow(RangeError);
  });
});
