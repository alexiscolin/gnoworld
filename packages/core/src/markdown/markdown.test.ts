import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { MAX_INLINE_DEPTH, MAX_QUOTE_DEPTH, markdown, type Block, type Inline } from "./markdown.ts";

// The same seed as core's other properties, so the gate never flaps on one.
const PROPERTY = { seed: 20261017, numRuns: 300 };
const text = (value: string): Inline => ({ type: "text", text: value });
const em = (...children: Inline[]): Inline => ({ type: "em", children });
const strong = (...children: Inline[]): Inline => ({ type: "strong", children });
const link = (href: string, label = href): Inline => ({ type: "link", href, children: [text(label)] });
const paragraph = (...children: Inline[]): Block => ({ type: "paragraph", children });
const br: Inline = { type: "break" };
const reads = (source: string, ...blocks: Block[]) => {
  expect(markdown(source)).toStrictEqual(blocks);
};
const plain = (source: string) => {
  reads(source, paragraph(text(source)));
};

describe("markdown: marks within a line", () => {
  test("keeps plain text as text, in one paragraph, its ends trimmed", () => {
    reads("hello world", paragraph(text("hello world")));
    reads("  hello  ", paragraph(text("hello")));
  });

  test.each([
    ["**bold**", "strong"],
    ["__bold__", "strong"],
    ["*italic*", "em"],
    ["_italic_", "em"],
    ["~~struck~~", "strike"],
  ] as const)("reads %s as %s", (source, type) => {
    reads(source, paragraph({ type, children: [text(source.replace(/[*_~]/g, ""))] }));
  });

  test.each<[string, Inline[]]>([
    ["x **b** y", [text("x "), strong(text("b")), text(" y")]],
    ["(**b**)", [text("("), strong(text("b")), text(")")]],
    ["**b**.", [strong(text("b")), text(".")]],
    ["_i_,", [em(text("i")), text(",")]],
    ["*a* *b*", [em(text("a")), text(" "), em(text("b"))]],
    ["**😀**", [strong(text("😀"))]],
    ["🔥**hot**🔥", [text("🔥"), strong(text("hot")), text("🔥")]],
    ["**café**", [strong(text("café"))]],
  ])("reads a mark beside words, punctuation and emoji (%j)", (source, children) => {
    reads(source, paragraph(...children));
  });

  test("nests marks: italic in bold, struck in italic", () => {
    reads("**a *b ~~c~~***", paragraph(strong(text("a "), em(text("b "), { type: "strike", children: [text("c")] }))));
  });

  test("reads three stars as italic around bold, and closes them one by one", () => {
    reads("***both***", paragraph(em(strong(text("both")))));
    reads("***a** b*", paragraph(em(strong(text("a")), text(" b"))));
  });

  test("reads crossed marks as the first pair that closes, the rest as text", () => {
    reads("**a *b** c*", paragraph(strong(text("a *b")), text(" c*")));
    reads("*a _b* c_", paragraph(em(text("a _b")), text(" c_")));
  });

  test.each([
    "**open",
    "*open",
    "~~open",
    "`open",
    "a ** b",
    "a ** b ** c",
    "a ~~ b ~~ c",
    "2 * 3 * 4",
    "**",
    "*",
    "__",
    "~~",
  ])("keeps an unclosed, empty or spaced mark as its own text (%j)", plain);

  test.each(["****a****", "~a~", "~~~a~~~"])("reads no mark of another length (%j)", plain);

  // ADR-0002's "at word bounds": no mark inside a word, as snake_case and 2*3*4 write.
  test.each([
    "snake_case_name",
    "snake__case__name",
    "2*3*4",
    "foo_bar baz_ qux",
    "ça_va_",
    "a*b*c",
    "a***b***c",
    "a~~b~~c",
    "**a**b",
  ])("reads no mark inside a word (%j)", plain);

  test.each([
    ["\\*not italic\\*", "*not italic*"],
    ["\\`not code\\`", "`not code`"],
    ["a \\\\ b", "a \\ b"],
    ["\\_x\\_", "_x_"],
    ["\\~~x\\~~", "~~x~~"],
    ["\\[x\\]", "[x]"],
    ["\\h stays", "\\h stays"],
    ["abc\\", "abc\\"],
  ])("takes a backslash's next mark as text (%j)", (source, shown) => {
    reads(source, paragraph(text(shown)));
  });

  test("reads a mark after an escaped backslash", () => {
    reads("\\\\*a*", paragraph(text("\\"), em(text("a"))));
  });

  test("reads inline code whole, no mark and no escape inside it", () => {
    reads("run `**not bold**` now", paragraph(text("run "), { type: "code", text: "**not bold**" }, text(" now")));
    reads("`a\\*b`", paragraph({ type: "code", text: "a\\*b" }));
    reads("*a `*` b*", paragraph(em(text("a "), { type: "code", text: "*" }, text(" b"))));
  });

  test("reads code by runs of the same length", () => {
    reads("``a`b``", paragraph({ type: "code", text: "a`b" }));
    reads("```x```", paragraph({ type: "code", text: "x" }));
  });

  test.each(["``", "`` ``x"])("keeps an empty or blank code run as text (%j)", plain);

  test("ends a line's code at the line's end: a run closed on the next line is no code", () => {
    reads("a `b\nc` d", paragraph(text("a `b"), br, text("c` d")));
  });

  test(`nests ${String(MAX_INLINE_DEPTH)} marks at most: deeper ones stay text`, () => {
    expect(MAX_INLINE_DEPTH).toBe(8);
    const nested = "*a ".repeat(9) + "x" + " a*".repeat(9);
    expect(depthOf(markdown(nested))).toBe(MAX_INLINE_DEPTH);
    // Eight runs open and eight close: the ninth pair's two stars stay text.
    expect(flat(markdown(nested)).join("").split("*").length - 1).toBe(2);
    expect(depthOf(markdown("***a** b* ".repeat(4) + "*a ".repeat(9) + "x"))).toBeLessThanOrEqual(MAX_INLINE_DEPTH);
    expect(words(markdown(nested))).toStrictEqual(words([paragraph(text(nested.replace(/\*/g, "")))]));
    expect(depthOf(markdown("***a ".repeat(5) + "x" + " a***".repeat(5)))).toBeLessThanOrEqual(MAX_INLINE_DEPTH);
  });
});

describe("markdown: links, https alone", () => {
  test("reads a link with its label, marks and code in the label", () => {
    reads(
      "see [the docs](https://gno.land/docs) now",
      paragraph(text("see "), link("https://gno.land/docs", "the docs"), text(" now")),
    );
    reads(
      "[**bold** label](https://a.example)",
      paragraph({ type: "link", href: "https://a.example", children: [strong(text("bold")), text(" label")] }),
    );
    reads(
      "[`c`](https://a.example)",
      paragraph({ type: "link", href: "https://a.example", children: [{ type: "code", text: "c" }] }),
    );
  });

  test("reads an escaped bracket in a label as text, and a link or code inside parentheses", () => {
    reads("[a\\]b](https://a.example)", paragraph(link("https://a.example", "a]b")));
    reads("([a](https://a.example))", paragraph(text("("), link("https://a.example", "a"), text(")")));
    reads("(`x`)", paragraph(text("("), { type: "code", text: "x" }, text(")")));
  });

  test("keeps an address's balanced parentheses, a port and a query", () => {
    reads(
      "[Gno](https://en.example/wiki/Gno_(language))",
      paragraph(link("https://en.example/wiki/Gno_(language)", "Gno")),
    );
    reads("[x](https://a.example:8443/p?q=1#top)", paragraph(link("https://a.example:8443/p?q=1#top", "x")));
  });

  test("links no address inside a label: one link, its label text", () => {
    reads("[https://a.example](https://b.example)", paragraph(link("https://b.example", "https://a.example")));
    reads(
      "[see https://a.example/x](https://b.example)",
      paragraph(link("https://b.example", "see https://a.example/x")),
    );
  });

  test("keeps the inner link of a link's label, the outer one text", () => {
    reads(
      "[a [b](https://b.example)](https://a.example)",
      paragraph(text("[a "), link("https://b.example", "b"), text("]("), link("https://a.example"), text(")")),
    );
    reads(
      "[**[b](https://b.example)**](https://a.example)",
      paragraph(text("["), strong(link("https://b.example", "b")), text("]("), link("https://a.example"), text(")")),
    );
  });

  test("closes no mark past a label's start, and makes no link of an empty or invisible label", () => {
    reads("*[a*](https://a.example)", paragraph(text("*"), link("https://a.example", "a*")));
    reads("[](https://a.example)", paragraph(text("[]("), link("https://a.example"), text(")")));
    reads("[ ](https://a.example)", paragraph(text("[ ]("), link("https://a.example"), text(")")));
    reads("[\u200b](https://a.example)", paragraph(text("[\u200b]("), link("https://a.example"), text(")")));
  });

  test("reads a bare https address at a word's start as a link to itself", () => {
    reads(
      "go to https://gno.land/r/demo, then",
      paragraph(text("go to "), link("https://gno.land/r/demo"), text(", then")),
    );
    reads("(see https://a.example/x)", paragraph(text("(see "), link("https://a.example/x"), text(")")));
    reads("**https://a.example**", paragraph(strong(link("https://a.example"))));
  });

  test.each([
    ["https://a.example.", "https://a.example", "."],
    ["https://a.example?", "https://a.example", "?"],
    ["https://a.example;", "https://a.example", ";"],
    ["https://a.example!", "https://a.example", "!"],
    ["https://a.example/x).", "https://a.example/x", ")."],
    ["https://a.example:", "https://a.example", ":"],
    ["https://a.example'", "https://a.example", "'"],
    ["https://a.example/(a)(b))", "https://a.example/(a)(b)", ")"],
  ])("leaves a bare address's closing marks out (%j)", (source, href, after) => {
    reads(source, paragraph(link(href), text(after)));
  });

  test("reads a bare address inside a mark, the mark's run left out of it", () => {
    reads("~~https://a.example~~", paragraph({ type: "strike", children: [link("https://a.example")] }));
    reads("_https://a.example_", paragraph(em(link("https://a.example"))));
    reads("((https://a.example/x))", paragraph(text("(("), link("https://a.example/x"), text("))")));
  });

  test("links no bare address after an unclosed `[` on its line: a label might still close", () => {
    plain("use [ and see https://a.example");
  });

  test("keeps a bare address's balanced parentheses, and a mark's letters inside it", () => {
    reads("https://en.example/wiki/Gno_(language)", paragraph(link("https://en.example/wiki/Gno_(language)")));
    reads("see https://a.example/_x_/y ok", paragraph(text("see "), link("https://a.example/_x_/y"), text(" ok")));
  });

  test.each([
    "xhttps://a.example",
    "`https://a.example`",
    "https://",
    "www.a.example",
    "<https://a.example>",
    '"https://a.example"',
  ])("links nothing in %j", (source) => {
    expect(hrefs(markdown(source))).toStrictEqual([]);
  });

  test("keeps an entity as its own letters: none is decoded", () => {
    plain("&lt;b&gt; &#106;avascript:x");
  });

  test.each([
    "[x](javascript:alert(1))",
    "[x](JavaScript:alert(1))",
    "[x](http://plain.example)",
    "[x](HTTPS://a.example)",
    "[x](data:text/html,<script>alert(1)</script>)",
    "[x](//example.com)",
    "[x](/relative)",
    "[x](vbscript:msgbox)",
    "[x](https://user:pw@evil.example)",
    "[x](https://gno.land@evil.example/)",
    "[x](https://evil.example\\@gno.land)",
    "[x](https://a.example\\path)",
    "[x](https://a.example/\u0000)",
    "[x](https://a​b.example)",
    "[x](https://a.example/‮)",
    '[x](https://a.example/"onclick=x)',
    "[x](https://café.example)",
    "[x](https://@@)",
    "[x](https://:80)",
    "[x](https://.)",
    "[x](https://a.example:123456)",
  ])("makes no link of %j, its letters kept", (source) => {
    const tree = markdown(source);
    expect(allowed(tree)).toBe(true);
    expect(hrefs(tree)).toStrictEqual([]);
    expect(words(tree)).toStrictEqual(source.match(/[\p{L}\p{N}]+/gu));
  });

  test("links, of an address with an angle or a space of any kind, the part before it alone", () => {
    reads("[x](https://a.example/<b>)", paragraph(text("[x]("), link("https://a.example/"), text("<b>)")));
    reads("[x](https://a.example/\u00a0b)", paragraph(text("[x]("), link("https://a.example/"), text("\u00a0b)")));
    reads("https://a.example/x\u3000y", paragraph(link("https://a.example/x"), text("\u3000y")));
    reads("https://a.example/x\u2028y", paragraph(link("https://a.example/x"), text("\u2028y")));
  });

  test.each([
    'https://a.example/x"y',
    "https://a.example/x\u200by",
    "https://a.example/x\\y",
    "https://a.example/x`y`",
  ])("links no bare address holding a quote, a format character, a backslash or a backtick (%j)", (source) => {
    expect(hrefs(markdown(source))).toStrictEqual([]);
  });

  test.each([
    "javascript:alert(1)",
    "http://plain.example",
    "data:text/html,x",
    "ftp://files.example",
    "HTTPS://a.example",
  ])("links no bare address that is not https (%s)", plain);

  test.each([
    "[x](javascript:https://a.example/x)",
    "https://user:pw@evil.example",
    "https://gno.land@evil.example/",
    "https://a​b.example",
  ])("links no address hidden in another (%j)", plain);

  test("ends a link's address at a space: what follows is text, the bare part a link", () => {
    reads("[x](https://exa mple.com)", paragraph(text("[x]("), link("https://exa"), text(" mple.com)")));
  });

  test("shows an image's mark as text, and its address as a link with its alt", () => {
    reads("![alt](https://x.example/a.png)", paragraph(text("!"), link("https://x.example/a.png", "alt")));
  });
});

describe("markdown: blocks", () => {
  test("splits paragraphs on blank lines, and keeps a single line break", () => {
    reads("one\ntwo\n\nthree", paragraph(text("one"), br, text("two")), paragraph(text("three")));
    reads("one\n\n\n\nthree", paragraph(text("one")), paragraph(text("three")));
    reads("one\n  \ntwo", paragraph(text("one")), paragraph(text("two")));
  });

  test("reads CR LF and CR as LF, and puts no break at a message's ends", () => {
    expect(markdown("a\r\nb")).toStrictEqual(markdown("a\nb"));
    expect(markdown("a\rb")).toStrictEqual(markdown("a\nb"));
    reads("a\n", paragraph(text("a")));
    reads("\na", paragraph(text("a")));
  });

  test("reads a fenced code block whole, marks, blank lines and indents kept, its language dropped", () => {
    reads("```\n**not bold**\n<b>x</b>\n```", { type: "codeBlock", text: "**not bold**\n<b>x</b>" });
    reads("```js\na\n\n  b\n```", { type: "codeBlock", text: "a\n\n  b" });
    reads("````\nx\n```\n````", { type: "codeBlock", text: "x\n```" });
    reads("```\n```", { type: "codeBlock", text: "" });
  });

  test("reads a fence never closed as text, so a one-line message keeps every word", () => {
    reads("```\nopen", paragraph(text("```"), br, text("open")));
    plain("```foo bar");
  });

  test("ends a paragraph before a code block, and starts one after it", () => {
    reads(
      "before\n```\na\n```\nafter",
      paragraph(text("before")),
      { type: "codeBlock", text: "a" },
      paragraph(text("after")),
    );
  });

  test("reads a quote, its lines' marks inside it", () => {
    reads("> **said**\n> again", { type: "quote", children: [paragraph(strong(text("said")), br, text("again"))] });
    reads(">a", { type: "quote", children: [paragraph(text("a"))] });
    reads("> a\n>\n> b", { type: "quote", children: [paragraph(text("a")), paragraph(text("b"))] });
  });

  test("ends a quote at a line not quoted: no lazy line", () => {
    reads("> a\nb", { type: "quote", children: [paragraph(text("a"))] }, paragraph(text("b")));
    reads("a\n> b", paragraph(text("a")), { type: "quote", children: [paragraph(text("b"))] });
    reads("> a\n\nb", { type: "quote", children: [paragraph(text("a"))] }, paragraph(text("b")));
  });

  test("reads a quote in a quote, and a list and code in a quote", () => {
    reads("> > a", { type: "quote", children: [{ type: "quote", children: [paragraph(text("a"))] }] });
    reads(">> a", { type: "quote", children: [{ type: "quote", children: [paragraph(text("a"))] }] });
    reads("> - a\n> - b", {
      type: "quote",
      children: [{ type: "list", ordered: false, items: [[text("a")], [text("b")]] }],
    });
    reads("> ```\n> *x*\n> ```", { type: "quote", children: [{ type: "codeBlock", text: "*x*" }] });
  });

  test(`nests ${String(MAX_QUOTE_DEPTH)} quotes at most: deeper marks stay text`, () => {
    expect(MAX_QUOTE_DEPTH).toBe(4);
    const inner: Block = paragraph(text("> > > > > > x"));
    const nested = [1, 2, 3, 4].reduce<Block>((block) => ({ type: "quote", children: [block] }), inner);
    reads("> ".repeat(10) + "x", nested);
  });

  test("reads a `>` within a line as text, and an empty quote's mark as text", () => {
    plain("a > b");
    reads("> ", paragraph(text(">")));
    reads(">\n>", paragraph(text(">"), br, text(">")));
  });

  test.each([
    ["- a\n- b", false],
    ["* a\n* b", false],
    ["+ a\n+ b", false],
    ["1. a\n2. b", true],
    ["10. a\n11. b", true],
    ["123456789. a\n2. b", true],
  ])("reads a list (%j)", (source, ordered) => {
    reads(source, { type: "list", ordered, items: [[text("a")], [text("b")]] });
  });

  test("reads marks in a list's items, and an empty item", () => {
    reads("- **a**\n- ", { type: "list", ordered: false, items: [[strong(text("a"))], []] });
  });

  test("ends a paragraph before a list, and a list before what follows", () => {
    reads("Things:\n- a\n- b", paragraph(text("Things:")), {
      type: "list",
      ordered: false,
      items: [[text("a")], [text("b")]],
    });
    reads("- a\n- b\n\nc", { type: "list", ordered: false, items: [[text("a")], [text("b")]] }, paragraph(text("c")));
    reads("- a\nmore", { type: "list", ordered: false, items: [[text("a")]] }, paragraph(text("more")));
    reads(
      "- a\n1. b",
      { type: "list", ordered: false, items: [[text("a")]] },
      { type: "list", ordered: true, items: [[text("b")]] },
    );
  });

  test("reads an indented item as one of the same list: no nested list", () => {
    reads("- a\n  - b", { type: "list", ordered: false, items: [[text("a")], [text("b")]] });
  });

  test.each([
    "-1 is less",
    "1.5 is a number",
    "-",
    "\\- not an item",
    "1\\. not an item",
    "\\> not a quote",
    "1234567890. big",
  ])("reads no list or quote in %j", (source) => {
    expect(markdown(source).map((block) => block.type)).toStrictEqual(["paragraph"]);
  });

  test("reads marks at a line's start as marks, not a list", () => {
    reads("*a*", paragraph(em(text("a"))));
    reads("**a** b", paragraph(strong(text("a")), text(" b")));
  });

  test.each(["# Heading", "## Heading", "<script>alert(1)</script>", "---", "***", "| a | b |"])(
    "reads no heading, HTML, rule or table: %j stays text",
    plain,
  );

  test.each([
    ["Title\n===", paragraph(text("Title"), br, text("==="))],
    ["a\n---", paragraph(text("a"), br, text("---"))],
  ])("reads no underlined heading (%j)", (source, block) => {
    reads(source, block);
  });

  test("gives nothing for an empty message, or one of blank lines", () => {
    reads("");
    reads("\n\n  \n");
  });
});

// The green pass's cases (4c's pre-merge): each kills a StrykerJS survivor the tests above let live.
describe("markdown: the edges StrykerJS found", () => {
  const strike = (...children: Inline[]): Inline => ({ type: "strike", children });
  test.each([
    ": https://.",
    "a/[x](https://@@)",
    'see https://a.example/x"y',
    "see https://a.example/x`y",
    "see https://a.example/x\u200by",
  ])("keeps %j as text: an address no host or character allows", plain);

  test("ends a bare address at an angle, the angle text", () => {
    reads("https://a.example<", paragraph(link("https://a.example"), text("<")));
  });

  test("reads the character before a mark whole, an astral one included", () => {
    plain("𝐀**b**");
    plain("a 𠀀**b**");
    plain("!\uE000**b**");
    reads("🐀**b**", paragraph(text("🐀"), strong(text("b"))));
  });

  test.each(["** a**", "~~ a~~", "**a **", "*a *", "~~a ~~"])(
    "opens no mark before a space nor closes one after it (%j)",
    plain,
  );

  test("makes no link of a label of spaces or invisible characters, in a mark or not", () => {
    reads(
      "[\u200b\u200b](https://a.example)",
      paragraph(text("[\u200b\u200b]("), link("https://a.example"), text(")")),
    );
    reads("[  ](https://a.example)", paragraph(text("[  ]("), link("https://a.example"), text(")")));
    reads(
      "[**\u200b**](https://a.example)",
      paragraph(text("["), strong(text("\u200b")), text("]("), link("https://a.example"), text(")")),
    );
  });

  // 4c's security review (F781): what draws nothing but is no space or format character, in text or in code.
  test.each(["\u3164", "\u2800", "\u115f", "\u1160", "\u034f", "\ufe0f", "\u3164\u2800"])(
    "makes no link of a label of %j, a character that draws nothing",
    (blank) => {
      reads(`[${blank}](https://a.example)`, paragraph(text(`[${blank}](`), link("https://a.example"), text(")")));
    },
  );

  test("makes no link of a label of code that draws nothing", () => {
    reads(
      "[`\u200b`](https://a.example)",
      paragraph(text("["), { type: "code", text: "\u200b" }, text("]("), link("https://a.example"), text(")")),
    );
  });

  test("links a label whose mark never closes, the mark text in it", () => {
    reads("[*a](https://a.example)", paragraph(link("https://a.example", "*a")));
  });

  test("reads a `]` with no label open as text inside a mark", () => {
    reads("*a] b*", paragraph(em(text("a] b"))));
    reads("**x]y**", paragraph(strong(text("x]y"))));
  });

  test("gives back the depth of each link and mark closed: many in a row nest nothing", () => {
    const links = Array.from({ length: 5 }, () => [link("https://x.example", "a"), text(" ")]).flat();
    reads("[a](https://x.example) ".repeat(5) + "**b**", paragraph(...links, strong(text("b"))));
    const bold = (word: string) => [strong(text(word)), text(" ")];
    reads("**a** **b** **c** **d** **e**", paragraph(...["a", "b", "c", "d"].flatMap(bold), strong(text("e"))));
    reads(
      "**a *b** ".repeat(5) + "**c**",
      paragraph(...Array.from({ length: 5 }, () => bold("a *b")).flat(), strong(text("c"))),
    );
  });

  test("keeps the rest of three stars that closed two", () => {
    reads("***a** b", paragraph(text("*"), strong(text("a")), text(" b")));
  });

  test("closes a fence on backticks alone, spaces around them, and on nothing else", () => {
    reads("```\na\n  ```  ", { type: "codeBlock", text: "a" });
    reads("```\nrun ```\n```", { type: "codeBlock", text: "run ```" });
    reads("```\n`x` is code\n```", { type: "codeBlock", text: "`x` is code" });
  });

  test("takes one space after a quote's `>`, the others kept, and trims a list item", () => {
    reads(">a b", { type: "quote", children: [paragraph(text("a b"))] });
    reads("-   a  ", { type: "list", ordered: false, items: [[text("a")]] });
    reads("1.   a  ", { type: "list", ordered: true, items: [[text("a")]] });
  });

  test("reads a struck address", () => {
    reads("~~https://a.example~~", paragraph(strike(link("https://a.example"))));
  });
});

// The keys each node holds, and no other: a renderer draws these and nothing else.
const KEYS: Readonly<Record<string, string>> = {
  text: "text,type",
  strong: "children,type",
  em: "children,type",
  strike: "children,type",
  code: "text,type",
  link: "children,href,type",
  break: "type",
  paragraph: "children,type",
  codeBlock: "text,type",
  quote: "children,type",
  list: "items,ordered,type",
};
// An address a link may name: https, a plain ASCII host, a port, then a path with no space, backslash, quote,
// angle, backtick or control or format character; never a user before an @.
const HREF = /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*(:\d{1,5})?([/?#][^\s\\<>"`\p{C}]*)?$/u;
const keysOf = (node: object) => Object.keys(node).sort().join(",");

// A node the renderer knows, with its own keys alone, never empty; a link's address https, never inside a link.
function inlineAllowed(node: Inline, inLink: boolean): boolean {
  if (KEYS[node.type] !== keysOf(node)) return false;
  if (node.type === "text" || node.type === "code") return node.text !== "";
  // A break sits between a paragraph's lines alone.
  if (node.type === "break") return false;
  if (node.type === "link" && (inLink || !HREF.test(node.href))) return false;
  return node.children.length > 0 && run(node.children, inLink || node.type === "link");
}
// Nodes side by side, each allowed, no two texts in a row.
function run(nodes: readonly Inline[], inLink: boolean): boolean {
  return nodes.every(
    (node, n) => inlineAllowed(node, inLink) && !(node.type === "text" && nodes[n - 1]?.type === "text"),
  );
}
// A paragraph's lines, split at its breaks.
function linesOf(children: readonly Inline[]): Inline[][] {
  const lines: Inline[][] = [[]];
  for (const child of children) {
    if (child.type === "break") lines.push([]);
    else lines.at(-1)?.push(child);
  }
  return lines;
}
function allowed(blocks: readonly Block[]): boolean {
  return blocks.every((block) => {
    if (KEYS[block.type] !== keysOf(block)) return false;
    if (block.type === "paragraph") return linesOf(block.children).every((line) => line.length > 0 && run(line, false));
    if (block.type === "quote") return block.children.length > 0 && allowed(block.children);
    if (block.type === "list") return block.items.length > 0 && block.items.every((item) => run(item, false));
    return true;
  });
}
// The tree's texts, in order: texts, code, link labels, code blocks.
function flat(blocks: readonly Block[]): string[] {
  const inline = (node: Inline): string[] =>
    "children" in node ? node.children.flatMap(inline) : "text" in node ? [node.text] : [];
  return blocks.flatMap((block): string[] => {
    if (block.type === "codeBlock") return [block.text];
    if (block.type === "quote") return flat(block.children);
    if (block.type === "list") return block.items.flatMap((item) => item.flatMap(inline));
    return block.children.flatMap(inline);
  });
}
const words = (blocks: readonly Block[]) =>
  flat(blocks)
    .join(" ")
    .match(/[\p{L}\p{N}]+/gu);
function hrefs(blocks: readonly Block[]): string[] {
  const inline = (node: Inline): string[] =>
    node.type === "link"
      ? [node.href, ...node.children.flatMap(inline)]
      : "children" in node
        ? node.children.flatMap(inline)
        : [];
  return blocks.flatMap((block): string[] => {
    if (block.type === "quote") return hrefs(block.children);
    if (block.type === "list") return block.items.flatMap((item) => item.flatMap(inline));
    return block.type === "paragraph" ? block.children.flatMap(inline) : [];
  });
}
function depthOf(blocks: readonly Block[]): number {
  const deepest = (nodes: readonly Inline[]): number => nodes.reduce((most, node) => Math.max(most, inline(node)), 0);
  const inline = (node: Inline): number => ("children" in node ? 1 + deepest(node.children) : 0);
  return blocks.reduce((most, block) => {
    if (block.type === "quote") return Math.max(most, depthOf(block.children));
    if (block.type === "list") return block.items.reduce((inner, item) => Math.max(inner, deepest(item)), most);
    return block.type === "paragraph" ? Math.max(most, deepest(block.children)) : most;
  }, 0);
}
const count = (blocks: readonly Block[]): number => JSON.stringify(blocks).split('"type"').length - 1;

describe("markdown: whatever comes", () => {
  const fragments = fc.constantFrom(
    "*",
    "**",
    "_",
    "__",
    "~~",
    "`",
    "```",
    "[",
    "]",
    "(",
    ")",
    "\\",
    "> ",
    "\n> ",
    "- ",
    "\n- ",
    "1. ",
    "\n",
    " ",
    "\n```\n",
    "[x](https://a.example/y)",
    "[x](javascript:alert(1))",
    "[**b**](https://a.example)",
    "![i](https://a.example/i.png)",
    "https://u:p@a.example",
    "https://a.example/z",
    "\u0000",
    "‮",
    "​",
    "\r\n",
    "&#106;",
    '<a href="javascript:x">',
    "word",
    "café",
    "😀",
  );
  const message = fc
    .array(fc.oneof(fragments, fc.string({ unit: "binary", maxLength: 8 })), { maxLength: 60 })
    .map((parts) => parts.join(""));

  test("gives a tree of the allowed nodes alone, links https alone and none in another, never throwing", () => {
    fc.assert(
      fc.property(message, (source) => {
        expect(allowed(markdown(source))).toBe(true);
      }),
      { ...PROPERTY, numRuns: 2000 },
    );
  });

  test("names no address the message does not hold, and is the same each time", () => {
    fc.assert(
      fc.property(message, (source) => {
        const tree = markdown(source);
        for (const href of hrefs(tree)) expect(source).toContain(href);
        expect(markdown(source)).toStrictEqual(tree);
      }),
      PROPERTY,
    );
  });

  test("holds no more nodes than the message has characters, and nests no deeper than its caps", () => {
    fc.assert(
      fc.property(message, (source) => {
        const tree = markdown(source);
        expect(count(tree)).toBeLessThanOrEqual(source.length + 1);
        // A bare address is a link inside the deepest mark.
        expect(depthOf(tree)).toBeLessThanOrEqual(MAX_INLINE_DEPTH + 1);
      }),
      PROPERTY,
    );
  });

  test("loses no word of a line: each run of letters and digits is in a text, a code or an address", () => {
    const inline = fc.constantFrom(
      "*",
      "**",
      "_",
      "~~",
      "`",
      "[",
      "]",
      "(",
      ")",
      "\\",
      " ",
      "!",
      "[x](https://a.example/y)",
      "https://a.example/z",
      "word",
      "x1",
      "café",
    );
    fc.assert(
      fc.property(fc.array(inline, { maxLength: 40 }), (parts) => {
        // Led by a word, the message is one paragraph: no list number or fence language to drop.
        const source = `x ${parts.join("")}`;
        const tree = JSON.stringify(markdown(source));
        for (const word of source.match(/[A-Za-z0-9]+/g) ?? []) expect(tree).toContain(word);
      }),
      PROPERTY,
    );
  });

  test("never reads a message with something in it as nothing", () => {
    fc.assert(
      fc.property(message, (source) => {
        if (source.trim() !== "") expect(markdown(source).length).toBeGreaterThan(0);
      }),
      PROPERTY,
    );
  });

  // Linear time, as ADR-0002 §9 measures an algorithm: a family read at n and 4n characters takes about four times as
  // long, where a quadratic reader takes sixteen. The fastest of three reads each, so a pause of the machine or
  // StrykerJS's instrumentation, which slow both alike, change nothing; no growth is read under 20 ms.
  const fastest = (source: string) =>
    Math.min(
      ...[1, 2, 3].map(() => {
        const start = Date.now();
        markdown(source);
        return Date.now() - start;
      }),
    );
  const linear = (family: (size: number) => string) =>
    fastest(family(16_000)) < Math.max(8 * fastest(family(4_000)), 20);
  const repeated =
    (piece: string, end = "") =>
    (size: number) =>
      piece.repeat(Math.ceil(size / piece.length)) + end;

  test.each([
    "*a ",
    "_a ",
    "~~a ",
    "[",
    "[a](",
    "[a](https://x/",
    "`a ",
    "`` ` ",
    "https:// ",
    "https://a(",
    "(https://a/",
    "> ",
  ])("reads a line of %j in linear time, a backslash and a ) closing it", (piece) => {
    expect(linear(repeated(piece, "\\)"))).toBe(true);
    expect(allowed(markdown(repeated(piece, "\\)")(16_000)))).toBe(true);
  });

  test("reads nested addresses closed by a backslash in linear time", () => {
    const nested = (size: number) => {
      const count = Math.ceil(size / 15);
      return "[a](https://x/".repeat(count) + "\\" + ")".repeat(count);
    };
    expect(linear(nested)).toBe(true);
  });

  test.each(["```\n", "```\n````\n", ">\n", "> \n>> \n", "- \n1. \n"])("reads lines of %j in linear time", (piece) => {
    expect(linear(repeated(piece))).toBe(true);
    expect(allowed(markdown(repeated(piece)(16_000)))).toBe(true);
  });

  test("reads a deep pile of closed marks in linear time, its depth capped", () => {
    const pile = (size: number) => {
      const count = Math.ceil(size / 22);
      return "**a _b ~~c ".repeat(count) + "x" + " c~~ b_ a**".repeat(count);
    };
    expect(linear(pile)).toBe(true);
    expect(depthOf(markdown(pile(16_000)))).toBeLessThanOrEqual(MAX_INLINE_DEPTH);
  });
});
