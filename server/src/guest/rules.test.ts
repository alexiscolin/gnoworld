import { describe, expect, it } from "vitest";
import type { Rules } from "../roles/roles.ts";
import { GUEST_LINE_BYTES, GUEST_LINE_MAX, guestRules, guestVerdict } from "./rules.ts";

const WORLD: Rules = { bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const DEFAULTS: Rules = { bannedWords: ["scam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const rules = (): Rules => {
  const made = guestRules(WORLD, DEFAULTS);
  if (made === undefined) throw new Error("no rules");
  return made;
};

describe("a guest's rules (plan 3.2)", () => {
  it("are stricter than the account's: no link, one mention, the world's words and the default's", () => {
    expect(rules()).toEqual({
      bannedWords: expect.arrayContaining(["spam", "scam"]) as string[],
      linksPerMessage: 0,
      mentionsPerMessage: 1,
      linksForNewAccount: 0,
    });
    expect(rules().bannedWords).toHaveLength(2);
  });

  it("take the default's words alone in a world the file does not list, and the world's alone without defaults", () => {
    expect(guestRules(undefined, DEFAULTS)?.bannedWords).toEqual(["scam"]);
    expect(guestRules(WORLD, undefined)?.bannedWords).toEqual(["spam"]);
  });

  it("are none without a world's rules and without defaults: a room with no rules is no room for a guest", () => {
    expect(guestRules(undefined, undefined)).toBeUndefined();
  });

  it("leave the world's own rules untouched, so an account's old answers stay", () => {
    guestRules(WORLD, DEFAULTS);
    expect(WORLD).toEqual({ bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 });
  });
});

describe("guestVerdict", () => {
  const verdict = (text: string) => guestVerdict(text, rules());

  it("lets a plain line through, one mention too", () => {
    expect([verdict("hello there"), verdict("hi @ada"), verdict("a".repeat(GUEST_LINE_MAX))]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("refuses any link, whether it has a scheme or starts with www", () => {
    expect([verdict("see https://x.test"), verdict("see http://x.test"), verdict("see www.x.test")]).toEqual([
      "links",
      "links",
      "links",
    ]);
  });

  it("refuses two mentions, an address counting as one", () => {
    expect(verdict("@ada @bo")).toBe("mentions");
    expect(verdict(`@ada g1${"q".repeat(38)}`)).toBe("mentions");
  });

  it("refuses the world's banned word and the default's, as people read it (case, accents, full width)", () => {
    expect([verdict("this is SPAM"), verdict("a scam!"), verdict("Ｓｐａｍ")]).toEqual([
      "banned_word",
      "banned_word",
      "banned_word",
    ]);
  });

  it("refuses 281 characters and takes 280 ASCII ones", () => {
    expect(verdict("a".repeat(GUEST_LINE_MAX))).toBeUndefined();
    expect(verdict("a".repeat(GUEST_LINE_MAX + 1))).toBe("too_long");
  });

  it("holds a line to 400 UTF-8 bytes too, so RELAYMSG stays under 510: 100 emoji pass, 101 do not", () => {
    expect(GUEST_LINE_BYTES).toBe(400);
    expect(verdict("😀".repeat(100))).toBeUndefined();
    expect(verdict("😀".repeat(101))).toBe("too_long");
    expect(verdict("😀".repeat(GUEST_LINE_MAX))).toBe("too_long");
    expect(verdict("é".repeat(200))).toBeUndefined();
    expect(verdict("é".repeat(201))).toBe("too_long");
  });

  it("refuses two lines, whatever the break (LF, CR, CR LF, the Unicode ones), never cutting to the first", () => {
    expect(["a\nb", "a\rb", "a\r\nb", "a\u2028b", "a\u0085b"].map(verdict)).toEqual(Array<string>(5).fill("multiline"));
  });

  it("refuses a control character a client could use for a CTCP, a bell or a colour, and NUL", () => {
    expect(
      ["\u0001ACTION waves\u0001", "a\u0000b", "a\u0007b", "\u001b[31mred", "\u0003" + "4red"].map(verdict),
    ).toEqual(Array<string>(5).fill("control"));
  });

  it("folds accents and zero-width characters in a banned word, as an account's rules do", () => {
    expect([verdict("sp\u00e0m"), verdict("sp\u200bam"), verdict("s\u0070\u0301am")]).toEqual(
      Array<string>(3).fill("banned_word"),
    );
  });

  it("refuses DEL, a C1 control and a bidirectional override, written as escapes, as control", () => {
    expect(["a\u007fb", "a\u0090b", "a\u009fb", "a\u202eb", "a\u2066b", "a\u2069b"].map(verdict)).toEqual(
      Array<string>(6).fill("control"),
    );
  });

  it("calls a link what the chat makes clickable, https:// and www. alone: discord.gg/x is plain text", () => {
    expect([verdict("join discord.gg/x"), verdict("see example.com"), verdict("ftp://x.test")]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("refuses a lone surrogate as control, before any provider is asked: formatLine would throw on it", () => {
    expect(["a\ud800b", "\udc00", "x\ud83d", "\ude00y"].map(verdict)).toEqual(Array<string>(4).fill("control"));
    expect(verdict("fine 😀")).toBeUndefined();
  });

  it("calls a line empty when only invisible characters and spaces are left: zero-width, soft hyphen, joiner, word joiner, BOM", () => {
    expect(["\u200b", "\u200b\u200d", " \u2060 ", "\u00ad", "\ufeff", "\u200b \u200c\u200d"].map(verdict)).toEqual(
      Array<string>(6).fill("empty"),
    );
    expect(verdict("hi\u200b")).toBeUndefined();
  });

  it("calls a line empty when only direction marks, invisible operators, the Hangul filler or the braille blank are left", () => {
    expect(
      ["\u200e", "\u200f", "\u2062\u2063\u2064", "\u3164", "\u2800", "\u200e \u3164\u2800 \u200f"].map(verdict),
    ).toEqual(Array<string>(6).fill("empty"));
  });

  it("still passes what a reader sees: a ZWJ emoji family, Persian text with a ZWNJ, a word with a hidden mark", () => {
    expect([
      verdict("\u{1F468}\u200d\u{1F469}\u200d\u{1F467}\u200d\u{1F466}"),
      verdict("\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645"),
      verdict("hi\u200e"),
      verdict("\u2800 braille \u2800"),
    ]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("refuses an empty line and a line of spaces alone", () => {
    expect(["", "   ", "\t"].map(verdict)).toEqual(["empty", "empty", "empty"]);
  });

  it("names the first fault in a fixed order, so the answer never depends on the checks' order of writing", () => {
    expect(verdict(`${"a".repeat(300)} https://x.test`)).toBe("too_long");
    expect(verdict("a\nspam")).toBe("multiline");
  });
});
