import { markdown } from "@gnoworld/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { $createLinkNode } from "@lexical/link";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { createComposerEditor, getMarkdown, setMarkdown } from "./markdownEditor.ts";

const through = (draft: string) => getMarkdown(createComposerEditor(draft));

// A word, then each mark the chat writes, round it: the canonical forms the editor gives back.
const word = fc.stringMatching(/^[a-z]{1,6}$/);
const marked = fc.oneof(
  word,
  word.map((w) => `**${w}**`),
  word.map((w) => `*${w}*`),
  word.map((w) => `++${w}++`),
  word.map((w) => `~~${w}~~`),
  word.map((w) => `\`${w}\``),
  word.map((w) => `***${w}***`),
  word.map((w) => `[${w}](https://gno.land/${w})`),
);
const text = fc.array(marked, { minLength: 1, maxLength: 5 }).map((parts) => parts.join(" "));
const block = fc.oneof(
  text,
  text.map((t) => `> ${t}`),
  text.map((t) => `- ${t}`),
  fc
    .array(text, { minLength: 1, maxLength: 3 })
    .map((items) => items.map((t, n) => `${String(n + 1)}. ${t}`).join("\n")),
  fc.array(word, { minLength: 1, maxLength: 3 }).map((lines) => `\`\`\`\n${lines.join("\n")}\n\`\`\``),
);
const draft = fc.array(block, { minLength: 1, maxLength: 4 }).map((blocks) => blocks.join("\n\n"));

// What a writer types: words, spaces and marks in any order, often unmatched. `kept` leaves out what stays different once through
// the editor (listed in .claude/tmp/slice-13/reports/lexical.md): marks and punctuation with no word, an `_` pair beside
// punctuation, a space inside a code span's backticks, a doubled mark left open, a quote with two spaces, a mark over a link.
const prose = fc
  .array(
    fc.oneof(
      { weight: 6, arbitrary: word },
      { weight: 4, arbitrary: fc.constant(" ") },
      {
        weight: 1,
        arbitrary: fc.constantFrom("*", "**", "_", "__", "~~", "++", "`", "> ", "- ", "1. ", "\n", "[x](https://a.b)"),
      },
    ),
    { maxLength: 24 },
  )
  .map((parts) => parts.join(""));

const kept = (md: string) => !/`\s|\s`|\*\*|__|>\s\s|\]\(/.test(md);

describe("the composer's Markdown, to the editor and back", () => {
  it("gives back exactly a draft of the chat's subset", () => {
    fc.assert(
      fc.property(draft, (md) => {
        expect(through(md)).toBe(md);
      }),
      { numRuns: 300 },
    );
  });

  it("is stable: what it gives back, read again by the editor, is read by the room as it was, for any draft", () => {
    fc.assert(
      fc.property(prose.filter(kept), (md) => {
        const once = through(md);
        expect(markdown(through(once))).toEqual(markdown(once));
      }),
      { numRuns: 500 },
    );
  });

  it("keeps blank lines and a line's leading spaces", () => {
    expect(through("a\n\nb")).toBe("a\n\nb");
    expect(through("  a")).toBe("  a");
    expect(through("")).toBe("");
  });

  it("writes underscore marks as the stars the room reads the same", () => {
    expect(through("_a_ __b__")).toBe("*a* **b**");
  });

  it("links https addresses alone: another scheme, or none, stays the words typed", () => {
    expect(through("[x](https://a.b/c)")).toBe("[x](https://a.b/c)");
    expect(through("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
    expect(through("[x]()")).toBe("[x]()");
    expect(through("[x](http://a.b)")).toBe("[x](http://a.b)");
  });

  it("leaves an underscore inside a word as it is, and escapes the marks the reader could take", () => {
    expect(through("gno_call a_b_c")).toBe("gno_call a_b_c");
    expect(through("2 * 3 and \\_x\\_ and \\*y\\*")).toBe("2 * 3 and \\_x\\_ and \\*y\\*");
    expect(markdown(through("gno_call and a_b_c"))).toEqual(markdown("gno_call and a_b_c"));
  });

  it("replaces what the editor holds with a draft set from outside", () => {
    const editor = createComposerEditor("one");
    setMarkdown(editor, "**two**");
    expect(getMarkdown(editor)).toBe("**two**");
    setMarkdown(editor, "");
    expect(getMarkdown(editor)).toBe("");
  });

  // The room's reader, not the text, is what must not change: the tree of the draft and of what the editor gives back.
  it("leaves the room's reading of a draft as it was, on drafts of marks and blocks mixed", () => {
    // A failed property prints its shrunk counterexample and its seed, which `fc.assert` takes back to replay it.
    fc.assert(
      fc.property(prose.filter(kept), (md) => {
        expect(markdown(through(md))).toEqual(markdown(md));
      }),
      { numRuns: 5000 },
    );
  });
});

// A paste of rich text brings nodes the writer never typed: what goes out is what the reader reads as the writer saw it.
describe("a link pasted with its attributes", () => {
  const linked = (url: string, title?: string) => {
    const editor = createComposerEditor();
    editor.update(
      () => {
        const link = $createLinkNode(url, title === undefined ? {} : { title });
        link.append($createTextNode("Docs"));
        $getRoot().clear().append($createParagraphNode().append(link));
      },
      { discrete: true },
    );
    return getMarkdown(editor);
  };

  it("never sends a title: the reader would read it as words, a link, a mention the sender never saw", () => {
    expect(linked("https://good.example/", "x [Click](https://evil.example/) @g1abc")).toBe(
      "[Docs](https://good.example/)",
    );
  });

  it("sends an address other than https as its words alone", () => {
    for (const url of ["http://a.example/", "mailto:a@b.example", "tel:123", "javascript:alert(1)"]) {
      expect(linked(url)).toBe("Docs");
    }
  });
});
