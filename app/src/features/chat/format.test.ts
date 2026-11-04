import { markdown, type Inline } from "@gnoworld/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatted, inserted, type Edit, type Format } from "./format.ts";

// A draft with its selection written in it: « and » around what is selected, | where the caret is.
function draft(marked: string): Edit {
  const start = marked.search(/[«|]/);
  const caret = marked.includes("|");
  const text = marked.replace(/[«»|]/g, "");
  const end = caret ? start : marked.indexOf("»") - 1;
  return { text, start, end };
}
const apply = (marked: string, format: Format) => formatted(draft(marked), format);

describe("formatted", () => {
  it.each([
    ["say «hi» now", "bold", "say **«hi»** now"],
    ["say «hi» now", "italic", "say *«hi»* now"],
    ["say «hi» now", "strike", "say ~~«hi»~~ now"],
    ["say «hi» now", "code", "say `«hi»` now"],
    ["say **«hi»** now", "italic", "say ***«hi»*** now"],
  ] as const)("wraps the selection of %j in %s, still selected", (before, format, after) => {
    expect(apply(before, format)).toStrictEqual(draft(after));
  });

  it.each([
    ["say **«hi»** now", "bold", "say «hi» now"],
    ["say *«hi»* now", "italic", "say «hi» now"],
    ["say ~~«hi»~~ now", "strike", "say «hi» now"],
    ["say `«hi»` now", "code", "say «hi» now"],
    ["say «**hi**» now", "bold", "say «hi» now"],
    ["say **|** now", "bold", "say | now"],
  ] as const)("unwraps %j when it is already %s", (before, format, after) => {
    expect(apply(before, format)).toStrictEqual(draft(after));
  });

  it("keeps the selection's spaces outside the marks, which close at a word's end alone", () => {
    expect(apply("say« hi »now", "bold")).toStrictEqual(draft("say **«hi»** now"));
    expect(apply("say« »now", "bold")).toStrictEqual(draft("say **|**now"));
  });

  it("takes a selection or a caret inside a word as the whole word: a mark holds whole words alone", () => {
    expect(apply("x«hi» y", "bold")).toStrictEqual(draft("**«xhi»** y"));
    expect(apply("he|llo there", "italic")).toStrictEqual(draft("*«hello»* there"));
    expect(apply("say hi|", "code")).toStrictEqual(draft("say `«hi»`"));
    expect(apply("**he|llo**", "bold")).toStrictEqual(draft("«hello»"));
    expect(apply("café« au »lait", "bold")).toStrictEqual(draft("café **«au»** lait"));
  });

  it("takes a word as Markdown reads one: a combining accent is part of it", () => {
    expect(apply("cafe\u0301|", "bold")).toStrictEqual(draft("**«cafe\u0301»**"));
    expect(apply("x «cafe\u0301» y", "italic")).toStrictEqual(draft("x *«cafe\u0301»* y"));
  });

  it("puts an empty pair at the caret, the caret between", () => {
    expect(apply("say |", "bold")).toStrictEqual(draft("say **|**"));
    expect(apply("|", "code")).toStrictEqual(draft("`|`"));
  });

  it("escapes a label's brackets and backslashes and leaves its spaces outside: the reader reads the label chosen", () => {
    expect(apply("see «a] b» now", "link")).toStrictEqual(draft("see [a\\] b](«https://») now"));
    expect(apply("x« word »y", "link")).toStrictEqual(draft("x [word](«https://») y"));
    expect(apply("x«  »y", "link")).toStrictEqual(draft("x  [|](https://)y"));
    const { text } = apply("«a] [b\\»", "link");
    expect(markdown(text.replace("https://", "https://a.example"))).toStrictEqual([
      {
        type: "paragraph",
        children: [{ type: "link", href: "https://a.example", children: [{ type: "text", text: "a] [b\\" }] }],
      },
    ]);
  });

  it("makes a link of the selection, its address selected to be typed", () => {
    expect(apply("see «the docs»", "link")).toStrictEqual(draft("see [the docs](«https://»)"));
    expect(apply("see |", "link")).toStrictEqual(draft("see [|](https://)"));
  });

  it.each([
    ["hello", "quote", "> hello"],
    ["hello", "bulleted", "- hello"],
    ["hello", "numbered", "1. hello"],
    ["> hello", "quote", "hello"],
    ["- hello", "bulleted", "hello"],
    ["1. hello", "numbered", "hello"],
    ["- hello", "quote", "> - hello"],
    ["2. hello", "numbered", "1. 2. hello"],
    ["* hello", "bulleted", "hello"],
    ["- hello", "numbered", "1. hello"],
    ["12. hello", "bulleted", "- 12. hello"],
    ["1986. was a good year", "numbered", "1. 1986. was a good year"],
  ] as const)("starts %j as a %s, or ends it", (text, format, result) => {
    expect(formatted({ text, start: 2, end: 2 }, format).text).toBe(result);
  });

  // A draft of several lines (slice 4's multiline): a quote or a list starts the lines the selection touches, the
  // caret's line alone for a caret, never the draft's first.
  it.each([
    ["a\nb|", "bulleted", "a\n- b|"],
    ["a\n|b\nc", "quote", "a\n> |b\nc"],
    ["«a\nb»", "bulleted", "- «a\n- b»"],
    ["«- a\n- b»", "bulleted", "«a\nb»"],
    ["«- a\nb»", "bulleted", "- «a\n- b»"],
    ["«- a\n- b»", "numbered", "1. «a\n1. b»"],
    ["«a\n»b", "bulleted", "- «a\n»b"],
    ["a|\nb", "bulleted", "- a|\nb"],
    // G6: a selection that starts at a line's end keeps its caret there, the lines after it started too.
    ["a«\nb»", "bulleted", "- a«\n- b»"],
    ["a«\nb»", "quote", "> a«\n> b»"],
    ["«a\nb\nc»", "bulleted", "- «a\n- b\n- c»"],
    ["x\n«a\n\nb»\ny", "quote", "x\n> «a\n> \n> b»\ny"],
  ] as const)("starts the lines %j touches as %s", (before, format, after) => {
    expect(apply(before, format)).toStrictEqual(draft(after));
  });

  // F1715 (CR3): a blank line between marked lines has no mark, so the toggle never turned off; a list leaves the blank
  // line bare when it starts the lines (an empty item is no text), a quote goes on through it.
  it.each([
    ["«- a\n\n- b»", "bulleted", "«a\n\nb»"],
    ["«1. a\n\n1. b»", "numbered", "«a\n\nb»"],
    ["«> a\n\n> b»", "quote", "«a\n\nb»"],
    ["«- a\n  \n- b»", "bulleted", "«a\n  \nb»"],
    ["«a\n\nb»", "bulleted", "- «a\n\n- b»"],
    ["«a\n\nb»", "numbered", "1. «a\n\n1. b»"],
    ["«- a\n\nb»", "numbered", "1. «a\n\n1. b»"],
    ["«- a\n\nb»", "bulleted", "- «a\n\n- b»"],
    ["a\n|\nb", "bulleted", "a\n- |\nb"],
    ["a\n|  \nb", "bulleted", "a\n- |  \nb"],
    ["|  ", "quote", "> |  "],
    ["a\n|\nb", "quote", "a\n> |\nb"],
  ] as const)("treats the blank line of %j as no line of a %s: %j", (before, format, after) => {
    expect(apply(before, format)).toStrictEqual(draft(after));
  });

  it("keeps the caret on the same letter when a line's start changes", () => {
    expect(formatted({ text: "hello", start: 2, end: 4 }, "quote")).toStrictEqual({
      text: "> hello",
      start: 4,
      end: 6,
    });
    expect(formatted({ text: "> hello", start: 4, end: 6 }, "quote")).toStrictEqual({
      text: "hello",
      start: 2,
      end: 4,
    });
    expect(formatted({ text: "> hello", start: 0, end: 1 }, "quote")).toStrictEqual({
      text: "hello",
      start: 0,
      end: 0,
    });
  });

  it("makes, of a selected word or part of one, what Markdown reads as that mark, and takes it off again", () => {
    const NODES = { bold: "strong", italic: "em", strike: "strike", code: "code" } as const;
    const words = fc.stringMatching(/^[a-z]{1,8}$/);
    const marks = fc.constantFrom<keyof typeof NODES>("bold", "italic", "strike", "code");
    fc.assert(
      fc.property(
        fc.record({ a: words, word: words, b: words, from: fc.nat(), size: fc.nat(), format: marks }),
        ({ a, word, b, from, size, format }) => {
          const start = a.length + 1 + (from % word.length);
          const edit = {
            text: `${a} ${word} ${b}`,
            start,
            end: start + (size % (word.length - (from % word.length) + 1)),
          };
          const once = formatted(edit, format);
          const [paragraph] = markdown(once.text);
          const node = paragraph?.type === "paragraph" ? paragraph.children[1] : undefined;
          expect(node?.type).toBe(NODES[format]);
          expect(formatted(once, format)).toStrictEqual({
            text: edit.text,
            start: a.length + 1,
            end: a.length + 1 + word.length,
          });
        },
      ),
      { seed: 20261017, numRuns: 200 },
    );
  });

  it.each([
    ["quote", { type: "quote", children: [{ type: "paragraph", children: [{ type: "text", text: "hello" }] }] }],
    ["bulleted", { type: "list", ordered: false, items: [[{ type: "text", text: "hello" }]] }],
    ["numbered", { type: "list", ordered: true, start: 1, items: [[{ type: "text", text: "hello" }]] }],
  ] as const)("starts a line Markdown reads as a %s", (format, block) => {
    expect(markdown(formatted({ text: "hello", start: 0, end: 0 }, format).text)).toStrictEqual([block]);
  });
});

// 8k: the bar's U writes `++` round whole words, as its siblings write theirs, and takes it off again.
describe("formatted, underline", () => {
  it.each([
    ["say «hi» now", "say ++«hi»++ now"],
    ["say« hi »now", "say ++«hi»++ now"],
    ["he|llo there", "++«hello»++ there"],
    ["say |", "say ++|++"],
    ["say **«hi»** now", "say **++«hi»++** now"],
    ["see «https://a.example/x» now", "see ++«https://a.example/x»++ now"],
  ] as const)("wraps %j in ++, still selected: %j", (before, after) => {
    expect(apply(before, "underline")).toStrictEqual(draft(after));
  });

  it.each([
    ["say ++«hi»++ now", "say «hi» now"],
    ["say «++hi++» now", "say «hi» now"],
    ["say ++|++ now", "say | now"],
    ["++he|llo++", "«hello»"],
  ] as const)("unwraps %j when it is already underlined: %j", (before, after) => {
    expect(apply(before, "underline")).toStrictEqual(draft(after));
  });

  // F5380: the writer's own `+` (C++, 1+1, +33) is text far more often than a star or a tilde. The bar escapes each one
  // in the words it underlines and beside them, so its runs are read whole and the words as written; taking the underline
  // off leaves the escapes, which read as the same words.
  it.each([
    ["I like «c++» lots", "I like ++«c\\+\\+»++ lots", ["I like ", "c++", " lots"]],
    ["I like c|++ lots", "I like ++«c»++\\+\\+ lots", ["I like ", "c", "++ lots"]],
    ["«1»+1", "++«1»++\\+1", ["", "1", "+1"]],
    ["a +«hi»+ b", "a \\+++«hi»++\\+ b", ["a +", "hi", "+ b"]],
    ["«+hi+»", "++«\\+hi\\+»++", ["", "+hi+", ""]],
    ["x «a\\+b» y", "x ++«a\\+b»++ y", ["x ", "a+b", " y"]],
  ] as const)("escapes the `+` of %j in and beside the underline: %j", (before, after, [left, under, right]) => {
    const once = apply(before, "underline");
    expect(once).toStrictEqual(draft(after));
    const read: Inline[] = left === "" ? [] : [{ type: "text", text: left }];
    read.push({ type: "underline", children: [{ type: "text", text: under }] });
    if (right !== "") read.push({ type: "text", text: right });
    expect(markdown(once.text)).toStrictEqual([{ type: "paragraph", children: read }]);
  });

  it("takes an underline off and leaves its escapes, read as the same words", () => {
    expect(apply("I like ++«c\\+\\+»++ lots", "underline")).toStrictEqual(draft("I like «c\\+\\+» lots"));
    expect(apply("I like «c\\+\\+» lots", "underline")).toStrictEqual(draft("I like ++«c\\+\\+»++ lots"));
  });

  it("underlines a selected word holding `+` as Markdown reads it, and takes it off to the same words", () => {
    const letters = fc.stringMatching(/^[a-z]{1,8}$/);
    const word = fc.stringMatching(/^[a-z][a-z+]{0,7}$/);
    fc.assert(
      fc.property(fc.record({ a: letters, word, b: letters }), ({ a, word: selected, b }) => {
        const edit = { text: `${a} ${selected} ${b}`, start: a.length + 1, end: a.length + 1 + selected.length };
        const once = formatted(edit, "underline");
        expect(markdown(once.text)).toStrictEqual([
          {
            type: "paragraph",
            children: [
              { type: "text", text: `${a} ` },
              { type: "underline", children: [{ type: "text", text: selected }] },
              { type: "text", text: ` ${b}` },
            ],
          },
        ]);
        const back = formatted(once, "underline");
        expect(markdown(back.text)).toStrictEqual(markdown(edit.text));
        expect(back.text.slice(back.start, back.end).replaceAll("\\", "")).toBe(selected);
      }),
      { seed: 20261017, numRuns: 200 },
    );
  });

  it("makes, of a selected word or part of one, what Markdown reads as underline, and takes it off again", () => {
    const words = fc.stringMatching(/^[a-z]{1,8}$/);
    fc.assert(
      fc.property(
        fc.record({ a: words, word: words, b: words, from: fc.nat(), size: fc.nat() }),
        ({ a, word, b, from, size }) => {
          const start = a.length + 1 + (from % word.length);
          const edit = {
            text: `${a} ${word} ${b}`,
            start,
            end: start + (size % (word.length - (from % word.length) + 1)),
          };
          const once = formatted(edit, "underline");
          const [paragraph] = markdown(once.text);
          const node = paragraph?.type === "paragraph" ? paragraph.children[1] : undefined;
          expect(node).toStrictEqual({ type: "underline", children: [{ type: "text", text: word }] });
          expect(formatted(once, "underline")).toStrictEqual({
            text: edit.text,
            start: a.length + 1,
            end: a.length + 1 + word.length,
          });
        },
      ),
      { seed: 20261017, numRuns: 200 },
    );
  });

  it("reads a bare address the bar underlined as an underlined link", () => {
    const { text } = apply("see «https://a.example/x» now", "underline");
    expect(markdown(text)).toStrictEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", text: "see " },
          {
            type: "underline",
            children: [
              { type: "link", href: "https://a.example/x", children: [{ type: "text", text: "https://a.example/x" }] },
            ],
          },
          { type: "text", text: " now" },
        ],
      },
    ]);
  });
});

// The green pass's cases (4c's pre-merge): a mark half in the selection, or one character of a longer run, is wrapped,
// never taken off, and no character is lost.
describe("formatted, at the edges StrykerJS found", () => {
  it.each<{ text: string; start: number; end: number; format: Format; result: Edit }>([
    { text: "hi **", start: 0, end: 5, format: "bold", result: { text: "**hi ****", start: 2, end: 7 } },
    { text: "** hi", start: 0, end: 5, format: "bold", result: { text: "**** hi**", start: 2, end: 7 } },
    { text: "**hi there", start: 2, end: 4, format: "bold", result: { text: "****hi** there", start: 4, end: 6 } },
    { text: "there hi**", start: 6, end: 8, format: "bold", result: { text: "there **hi****", start: 8, end: 10 } },
    { text: "**hi*", start: 0, end: 5, format: "italic", result: { text: "***hi**", start: 1, end: 6 } },
    { text: "*hi**", start: 0, end: 5, format: "italic", result: { text: "**hi***", start: 1, end: 6 } },
    { text: "**hi*", start: 2, end: 4, format: "italic", result: { text: "***hi**", start: 3, end: 5 } },
    { text: "*hi**", start: 1, end: 3, format: "italic", result: { text: "**hi***", start: 2, end: 4 } },
    { text: "**", start: 0, end: 2, format: "bold", result: { text: "******", start: 2, end: 4 } },
    { text: "x  hi", start: 1, end: 5, format: "bold", result: { text: "x  **hi**", start: 5, end: 7 } },
    { text: "x hi  ", start: 2, end: 6, format: "bold", result: { text: "x **hi**  ", start: 4, end: 6 } },
    { text: "a > b", start: 0, end: 0, format: "quote", result: { text: "> a > b", start: 2, end: 2 } },
  ])("makes, of $text from $start to $end in $format, $result.text", ({ text, start, end, format, result }) => {
    expect(formatted({ text, start, end }, format)).toStrictEqual(result);
  });
});

// 5q: the composer's @ and / buttons put their mark where the selection is, and the caret after it.
describe("inserted", () => {
  it("puts the mark at the caret and the caret after it", () => {
    expect(inserted(draft("hi |there"), "@")).toEqual({ text: "hi @there", start: 4, end: 4 });
    expect(inserted(draft("|"), "/")).toEqual({ text: "/", start: 1, end: 1 });
  });

  it("replaces a selection, as typing over it would", () => {
    expect(inserted(draft("say «this» now"), "@")).toEqual({ text: "say @ now", start: 5, end: 5 });
  });
});
