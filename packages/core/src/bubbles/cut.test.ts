import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MULTILINE_BYTES } from "../irc/multiline.ts";
import { cutText } from "./cut.ts";

// Slice 6's 6a: the text of a bubble (docs/plans/slice-6.md §1, §3): plain text, cut at `max` graphemes, no Cc or Cf
// character but a joiner between two emoji, no lone surrogate, no cluster over CLUSTER units (it is dropped whole).
const MAX = 80;
const CLUSTER = 32;
const ZWJ = "\u200d";
const MARK = "́";
const graphemes = (text: string): string[] => Array.from(new Intl.Segmenter().segment(text), (s) => s.segment);
const FAMILY = `👨${ZWJ}👩${ZWJ}👧${ZWJ}👦`;
const FLAG = "🇯🇵";
const BAD = /[\p{Cc}\p{Cf}]/u;
const JOINS = /(?<=[\p{Extended_Pictographic}\u{FE0F}\p{Emoji_Modifier}])\u{200D}(?=\p{Extended_Pictographic})/gu;
/** No Cc or Cf character at all, but a joiner that sits between two emoji: a stray U+200D is not hidden any more. */
const clean = (text: string): boolean => !BAD.test(text.replace(JOINS, ""));
const stack = (marks: number): string => `e${MARK.repeat(marks)}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cutText: the cut", () => {
  it("leaves a text of at most max graphemes as it is", () => {
    expect(cutText("hello", MAX)).toBe("hello");
    expect(cutText("a".repeat(MAX), MAX)).toBe("a".repeat(MAX));
    expect(cutText("", MAX)).toBe("");
  });

  it("cuts a text of max + 1 graphemes to its first max, and takes the max it is given", () => {
    expect(cutText("a".repeat(MAX + 1), MAX)).toBe("a".repeat(MAX));
    expect(cutText("abcdef", 3)).toBe("abc");
    expect(cutText("abc", 3)).toBe("abc");
  });

  it("counts graphemes, not code units: a decomposed letter is one", () => {
    const e = `e${MARK}`;
    expect(cutText(e.repeat(MAX), MAX)).toBe(e.repeat(MAX));
    expect(cutText(e.repeat(MAX + 1), MAX)).toBe(e.repeat(MAX));
  });

  it("keeps a surrogate pair whole when it is the last grapheme kept, and drops it whole when it is the next", () => {
    expect(cutText(`${"a".repeat(MAX - 1)}😀z`, MAX)).toBe(`${"a".repeat(MAX - 1)}😀`);
    expect(cutText(`${"a".repeat(MAX)}😀`, MAX)).toBe("a".repeat(MAX));
    expect(cutText(`${"a".repeat(MAX)}😀`, MAX).isWellFormed()).toBe(true);
  });

  it("keeps an emoji family whole at the limit and drops it whole one past", () => {
    expect(cutText(`${"a".repeat(MAX - 1)}${FAMILY}z`, MAX)).toBe(`${"a".repeat(MAX - 1)}${FAMILY}`);
    expect(cutText(`${"a".repeat(MAX)}${FAMILY}`, MAX)).toBe("a".repeat(MAX));
  });

  it("keeps a flag, two regional indicators, whole or drops it whole", () => {
    expect(cutText(`${"a".repeat(MAX - 1)}${FLAG}${FLAG}`, MAX)).toBe(`${"a".repeat(MAX - 1)}${FLAG}`);
  });

  it("keeps a stack of combining marks whole up to CLUSTER units, and drops one longer whole (finding 3)", () => {
    expect(stack(CLUSTER - 1)).toHaveLength(CLUSTER);
    expect(cutText(`ab${stack(CLUSTER - 1)}cd`, MAX)).toBe(`ab${stack(CLUSTER - 1)}cd`);
    expect(cutText(`ab${stack(CLUSTER)}cd`, MAX)).toBe("abcd");
    expect(cutText(`${stack(3000)}abc`, MAX)).toBe("abc");
    expect(cutText(`${"a".repeat(MAX)}${stack(3000)}`, MAX)).toBe("a".repeat(MAX));
  });

  it("does not count a dropped cluster against the max", () => {
    expect(cutText(`${"a".repeat(MAX - 1)}${stack(3000)}z`, MAX)).toBe(`${"a".repeat(MAX - 1)}z`);
    expect(cutText(`${"a".repeat(MAX - 1)}${stack(40)}zz`, MAX)).toBe(`${"a".repeat(MAX - 1)}z`);
  });

  it("drops the whole of a long stack, wherever it stands in a line of the relay's size", () => {
    for (const pad of [0, 1, 1000, 1020, 1023, 1024, 1025, 2047, 2048])
      for (const marks of [CLUSTER, 500, 1500, 1900])
        expect(
          cutText(`${"a".repeat(pad % 70)}${"\u200b".repeat(pad)}${stack(marks)}end`, MAX),
          `${String(pad)} ${String(marks)}`,
        ).toBe(`${"a".repeat(pad % 70)}end`);
  });

  it("keeps the grapheme after a long stack, wherever the stack ends (F3367)", () => {
    expect(cutText(`${"\u200b".repeat(991)}${stack(CLUSTER)}zq`, MAX)).toBe("zq");
    for (let pad = 900; pad < 1100; pad++)
      for (const marks of [CLUSTER, CLUSTER + 1, 1100])
        expect(cutText(`${"\u200b".repeat(pad)}${stack(marks)}zq`, MAX), `${String(pad)} ${String(marks)}`).toBe("zq");
  });

  it("is a prefix of the text's own graphemes, without the clusters over the limit, whatever the text (property)", () => {
    const unit = fc.oneof(
      fc.string({ unit: "grapheme", maxLength: 3 }),
      fc.constantFrom(FAMILY, FLAG, `e${MARK}`, "😀", MARK),
    );
    fc.assert(
      fc.property(fc.array(unit, { maxLength: 200 }), fc.integer({ min: 1, max: 160 }), (parts, max) => {
        const text = parts.join("");
        fc.pre(clean(text));
        const out = cutText(text, max);
        const kept = graphemes(text).filter((g) => g.length <= CLUSTER);
        expect(graphemes(out)).toEqual(kept.slice(0, max));
        expect(out.isWellFormed()).toBe(true);
      }),
    );
  });
});

describe("cutText: plain text", () => {
  it("leaves markup and links as text, character for character", () => {
    const text = '<img src=x onerror="alert(1)"> <b>hi</b> see https://evil.test/x?a=1&b=2 and [a](https://x.test)';
    expect(cutText(text, 160)).toBe(text);
  });

  it("removes the bidi overrides and isolates, the zero-width and invisible characters", () => {
    const bad = ["\u202a", "\u202b", "\u202c", "\u202d", "\u202e", "\u2066", "\u2067", "\u2068", "\u2069"];
    const more = ["\u200e", "\u200f", "\u061c", "\u200b", "\u200c", "\u2060", "\ufeff", "\u00ad", "\u2061"];
    for (const c of [...bad, ...more]) expect(cutText(`a${c}b`, MAX), JSON.stringify(c)).toBe("ab");
  });

  it("removes every control and format character there is, but the joiner of an emoji (finding 1)", () => {
    const all: number[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      if (BAD.test(String.fromCodePoint(cp)) && cp !== 0x200d) all.push(cp);
    }
    // The ones a hand-made list forgets: invisible tags that smuggle ASCII, the Arabic number signs, the interlinear
    // annotations and the deprecated format characters.
    const named = [0xe0001, 0xe0020, 0xe0041, 0xe007f, 0x600, 0x605, 0xfff9, 0xfffa, 0xfffb, 0x206a, 0x206f];
    for (const cp of named) expect(all, cp.toString(16)).toContain(cp);
    expect(all.length).toBeGreaterThan(200);
    const spaced = new Set([0x09, 0x0a, 0x0d]);
    for (const cp of all) {
      const c = String.fromCodePoint(cp);
      expect(cutText(`a${c}b`, MAX), `U+${cp.toString(16)}`).toBe(spaced.has(cp) ? "a b" : "ab");
    }
  });

  it("turns a line break or a tab into a space, and removes any other control character", () => {
    expect(cutText("one\ntwo", MAX)).toBe("one two");
    expect(cutText("one\r\ntwo", MAX).replace(/ +/g, " ")).toBe("one two");
    expect(cutText("one\ttwo", MAX)).toBe("one two");
    expect(cutText("a\u0000b\u0007c\u001bd\u009fe\u007ff", MAX)).toBe("abcdef");
  });

  it("keeps the joiner of an emoji sequence, and no other (finding 2)", () => {
    expect(cutText(FAMILY, MAX)).toBe(FAMILY);
    expect(cutText("❤️\u200d🔥", MAX)).toBe("❤️\u200d🔥");
    expect(cutText("👩🏽\u200d⚕️", MAX)).toBe("👩🏽\u200d⚕️");
  });

  it("removes a joiner that joins nothing: alone, between letters, at either end, or after an emoji and before a letter", () => {
    expect(cutText(ZWJ.repeat(3), MAX)).toBe("");
    expect(cutText(`a${ZWJ}b`, MAX)).toBe("ab");
    expect(cutText(`${ZWJ}👨`, MAX)).toBe("👨");
    expect(cutText(`👨${ZWJ}`, MAX)).toBe("👨");
    expect(cutText(`👨${ZWJ}a`, MAX)).toBe("👨a");
    expect(cutText(`a${ZWJ}👨`, MAX)).toBe("a👨");
  });

  it("keeps a sequence whole wherever it stands in a line of the relay's size", () => {
    const pads = [...Array.from({ length: 70 }, (_, n) => 1000 + n), 2040, 2047, 2048, 2049, 3990, 4000, 4050, 4080];
    for (const pad of pads) {
      const hidden = "\u200b".repeat(pad);
      expect(cutText(`${hidden}${FAMILY}`, MAX), `family ${String(pad)}`).toBe(FAMILY);
      expect(cutText(`${hidden}😀`, MAX), `pair ${String(pad)}`).toBe("😀");
      expect(cutText(`${hidden}\ud800x`, MAX), `lone ${String(pad)}`).toBe("x");
      expect(cutText(`${hidden}a${ZWJ}b`, MAX), `loose ${String(pad)}`).toBe("ab");
    }
  });

  it("removes a lone surrogate, high or low, and keeps the pair that stands next to it (finding 8)", () => {
    expect(cutText("a\ud800b", MAX)).toBe("ab");
    expect(cutText("a\udc00b", MAX)).toBe("ab");
    expect(cutText("\ud83d😀", MAX)).toBe("😀");
    expect(cutText(`${"a".repeat(MAX - 1)}\ud800z`, MAX)).toBe(`${"a".repeat(MAX - 1)}z`);
    expect(cutText(`${"a".repeat(MAX)}\ud83d`, MAX)).toBe("a".repeat(MAX));
    expect(cutText("\ud800", MAX)).toBe("");
    expect(cutText("😀\udc00", MAX).isWellFormed()).toBe(true);
  });

  it("cuts after the removal: hidden characters do not use up the room", () => {
    expect(cutText(`${"\u200b".repeat(MAX)}${"a".repeat(MAX)}`, MAX)).toBe("a".repeat(MAX));
  });

  it("returns a plain string with no control or format character, at most max graphemes and CLUSTER units each (property)", () => {
    const hostile = fc.constantFrom(
      "\u202e",
      "\u200b",
      "\n",
      "\u0007",
      "\u2066",
      "\ufeff",
      "\u0000",
      "\t",
      "\u00ad",
      ZWJ,
      "\ud800",
      "\udc00",
      "\u{e0041}",
    );
    const unit = fc.oneof(
      fc.string({ unit: "grapheme", maxLength: 3 }),
      hostile,
      fc.constantFrom(FAMILY, FLAG, MARK.repeat(40)),
    );
    fc.assert(
      fc.property(fc.array(unit, { maxLength: 300 }), fc.integer({ min: 20, max: 160 }), (parts, max) => {
        const out = cutText(parts.join(""), max);
        expect(typeof out).toBe("string");
        expect(clean(out)).toBe(true);
        expect(graphemes(out).length).toBeLessThanOrEqual(max);
        expect(out.length).toBeLessThanOrEqual(max * CLUSTER);
        expect(out.isWellFormed()).toBe(true);
      }),
    );
  });
});

describe("cutText: its cost", () => {
  // "é" is not printable ASCII, so it reaches the segmenter: the check proves a bound, not an empty list of calls (F3369).
  it("segments a head of the text, never a megabyte of it", () => {
    const segment = vi.spyOn(Intl.Segmenter.prototype, "segment");
    const out = cutText("é".repeat(1024 * 1024), MAX);
    expect(out).toBe("é".repeat(MAX));
    expect(segment.mock.calls.length).toBeGreaterThan(0);
    expect(segment.mock.calls.length).toBeLessThanOrEqual(2);
    const longest = Math.max(...segment.mock.calls.map(([input]) => input.length));
    expect(longest).toBeLessThanOrEqual(4096);
  });

  // F3368: the relay takes 4096 bytes a line (deploy/ergo/ircd.yaml.tmpl, MULTILINE_BYTES), so a text is one head, and a text
  // past it is not a line: a megabyte of anything costs what the head costs.
  it("reads one head of a megabyte that is one cluster, and keeps none of it", () => {
    const segment = vi.spyOn(Intl.Segmenter.prototype, "segment");
    expect(cutText(stack(1024 * 1024), MAX)).toBe("");
    expect(segment.mock.calls.length).toBe(1);
    expect(Math.max(...segment.mock.calls.map(([input]) => input.length))).toBeLessThanOrEqual(4096);
  });

  it("reads a megabyte that is all hidden as one head, not a window after a window", () => {
    const segment = vi.spyOn(Intl.Segmenter.prototype, "segment");
    expect(cutText("\u200b".repeat(1024 * 1024), MAX)).toBe("");
    expect(segment.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("leaves nothing of what lies past the relay's longest line: no line of the relay reaches it", () => {
    expect(cutText(`${"\u200b".repeat(MULTILINE_BYTES)}visible`, MAX)).toBe("");
    expect(cutText(`${"\u200b".repeat(MULTILINE_BYTES - 1)}visible`, MAX)).toBe("v");
  });

  it("never returns half a pair where the head ends", () => {
    const out = cutText(`${"\u200b".repeat(4095)}😀`, MAX);
    expect(out).toBe("");
    expect(out.isWellFormed()).toBe(true);
  });

  it("still finds its max graphemes behind a long run of hidden characters", () => {
    const text = `${"\u200b".repeat(4000)}${"a".repeat(MAX + 5)}`;
    const out = cutText(text, MAX);
    expect(out).toBe("a".repeat(MAX));
  });

  it("holds on a megabyte of line breaks, combining marks, joiners and emoji, and returns a short text (finding 3)", () => {
    for (const unit of ["\n", MARK, FAMILY, "x\u202e", ZWJ, "\ud800", `e${MARK}`.repeat(40)]) {
      const out = cutText(unit.repeat(Math.ceil((1024 * 1024) / unit.length)), MAX);
      expect(graphemes(out).length).toBeLessThanOrEqual(MAX);
      expect(out.length).toBeLessThanOrEqual(MAX * CLUSTER);
      expect(clean(out)).toBe(true);
    }
    const stacks = stack(CLUSTER - 1).repeat(1024 * 32);
    expect(cutText(stacks, MAX)).toBe(stack(CLUSTER - 1).repeat(MAX));
  });
});
